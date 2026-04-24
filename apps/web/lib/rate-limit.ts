import { getRedis } from "./redis";
import { logger } from "./logger";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redisKey = `rate_limit:${key}`;
  const now = Date.now();
  const windowStart = now - windowMs;
  const resetAt = new Date(now + windowMs);

  try {
    const redis = getRedis();

    await redis.zremrangebyscore(redisKey, 0, windowStart);
    const count = await redis.zcard(redisKey);

    if (count >= limit) {
      return { allowed: false, remaining: 0, resetAt };
    }

    await redis.zadd(redisKey, now, `${now}:${Math.random()}`);
    await redis.pexpire(redisKey, windowMs);

    return { allowed: true, remaining: limit - count - 1, resetAt };
  } catch (err) {
    logger.warn("rate limit redis error, failing open", { key, error: err instanceof Error ? err.message : String(err) });
    return { allowed: true, remaining: 1, resetAt };
  }
}
