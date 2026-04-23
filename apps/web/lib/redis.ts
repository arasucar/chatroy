import { Redis } from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL must be set");
    client = new Redis(url, { lazyConnect: true, enableReadyCheck: false });
  }
  return client;
}
