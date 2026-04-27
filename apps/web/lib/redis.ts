import { Redis } from "ioredis";
import { logger } from "./logger";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL must be set");
    client = new Redis(url, { lazyConnect: true, enableReadyCheck: false });
    client.on("error", (err) =>
      logger.error("redis connection error", {
        error: err.message,
        code: (err as NodeJS.ErrnoException).code,
      }),
    );
  }
  return client;
}
