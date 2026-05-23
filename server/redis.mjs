/**
 * Redis singleton. Every module imports { redis, getRedis } from here.
 * If REDIS_URL is not set the module still loads but all cache operations
 * become no-ops so the server can start without Redis in development.
 */
import Redis from "ioredis";

let _redis = null;

export function initRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[redis] REDIS_URL not set — running without Redis cache. Role changes will not be cached.");
    return null;
  }

  _redis = new Redis(url, {
    lazyConnect: false,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 3000),
  });

  _redis.on("connect",  () => console.log("[redis] Connected"));
  _redis.on("error",    (err) => console.error("[redis] Error:", err.message));
  _redis.on("close",    () => console.warn("[redis] Connection closed"));

  return _redis;
}

/** Returns the Redis client, or null if Redis is not configured. */
export function getRedis() {
  return _redis;
}

/** Safe set with expiry. No-op if Redis is down. */
export async function redisSetex(key, ttlSeconds, value) {
  if (!_redis) return;
  try {
    await _redis.setex(key, ttlSeconds, typeof value === "string" ? value : JSON.stringify(value));
  } catch { /* ignore cache write failures */ }
}

/** Safe get. Returns null on miss or Redis failure. */
export async function redisGet(key) {
  if (!_redis) return null;
  try {
    return await _redis.get(key);
  } catch {
    return null;
  }
}

/** Safe delete. No-op if Redis is down. */
export async function redisDel(key) {
  if (!_redis) return;
  try {
    await _redis.del(key);
  } catch { /* ignore */ }
}
