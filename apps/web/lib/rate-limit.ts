import { getRedis } from "./redis";
import { logger } from "./logger";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// Atomic Lua script: removes stale entries, checks the count, and conditionally
// adds the new member — all in a single Redis transaction to eliminate the
// TOCTOU race condition present in the previous three-command approach.
const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now  = tonumber(ARGV[1])
local win  = tonumber(ARGV[2])
local lim  = tonumber(ARGV[3])
local mbr  = ARGV[4]
local ttl  = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', key, 0, win)
local cnt = redis.call('ZCARD', key)
if cnt >= lim then return 0 end
redis.call('ZADD', key, now, mbr)
redis.call('PEXPIRE', key, ttl)
return 1
`;

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redisKey = `rate_limit:${key}`;
  const now = Date.now();
  const windowStart = now - windowMs;
  const resetAt = new Date(now + windowMs);
  const member = `${now}:${Math.random()}`;

  try {
    const redis = getRedis();

    const result = await redis.eval(
      RATE_LIMIT_SCRIPT,
      1,
      redisKey,
      now,
      windowStart,
      limit,
      member,
      windowMs,
    );

    const allowed = (result as number) === 1;
    return {
      allowed,
      remaining: allowed ? limit - 1 : 0,
      resetAt,
    };
  } catch (err) {
    logger.warn("rate limit redis error, failing open", { key, error: err instanceof Error ? err.message : String(err) });
    return { allowed: true, remaining: 1, resetAt };
  }
}
