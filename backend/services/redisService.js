import { createClient } from 'redis';

let redisClient = null;

/**
 * Initialize Redis connection
 */
export async function initRedis() {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  redisClient = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('Redis reconnection failed after 10 retries');
          return new Error('Redis reconnection failed');
        }
        const delay = Math.min(retries * 100, 3000);
        console.log(`Redis reconnecting... attempt ${retries}, delay ${delay}ms`);
        return delay;
      },
    },
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  redisClient.on('connect', () => {
    console.log('Redis Client Connected');
  });

  await redisClient.connect();
  return redisClient;
}

/**
 * Get Redis client instance
 */
export function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call initRedis() first.');
  }
  return redisClient;
}

/**
 * Close Redis connection
 */
export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Session storage using Redis
 */
export class RedisSessionStore {
  constructor(ttl = 604800) { // 7 days default
    this.ttl = ttl;
  }

  async set(token, data) {
    const client = getRedisClient();
    const key = `session:${token}`;
    await client.setEx(key, this.ttl, JSON.stringify(data));
  }

  async get(token) {
    const client = getRedisClient();
    const key = `session:${token}`;
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async delete(token) {
    const client = getRedisClient();
    const key = `session:${token}`;
    await client.del(key);
  }

  async deleteAll(userId) {
    const client = getRedisClient();
    const pattern = `session:*`;
    const keys = [];
    for await (const key of client.scanIterator({ MATCH: pattern })) {
      const data = await client.get(key);
      if (data) {
        const session = JSON.parse(data);
        if (session.user_id === userId) {
          keys.push(key);
        }
      }
    }
    if (keys.length > 0) {
      await client.del(keys);
    }
  }

  async cleanupExpired() {
    // Redis automatically handles TTL expiration
    // This is a no-op for Redis
  }
}

/**
 * Simple cache using Redis
 */
export class RedisCache {
  constructor(defaultTTL = 3600) { // 1 hour default
    this.defaultTTL = defaultTTL;
  }

  async set(key, value, ttl = this.defaultTTL) {
    const client = getRedisClient();
    const cacheKey = `cache:${key}`;
    await client.setEx(cacheKey, ttl, JSON.stringify(value));
  }

  async get(key) {
    const client = getRedisClient();
    const cacheKey = `cache:${key}`;
    const data = await client.get(cacheKey);
    return data ? JSON.parse(data) : null;
  }

  async delete(key) {
    const client = getRedisClient();
    const cacheKey = `cache:${key}`;
    await client.del(cacheKey);
  }

  async invalidatePattern(pattern) {
    const client = getRedisClient();
    const cachePattern = `cache:${pattern}`;
    const keys = [];
    for await (const key of client.scanIterator({ MATCH: cachePattern })) {
      keys.push(key);
    }
    if (keys.length > 0) {
      await client.del(keys);
    }
  }

  async clear() {
    const client = getRedisClient();
    const pattern = `cache:*`;
    const keys = [];
    for await (const key of client.scanIterator({ MATCH: pattern })) {
      keys.push(key);
    }
    if (keys.length > 0) {
      await client.del(keys);
    }
  }
}

export default { initRedis, getRedisClient, closeRedis, RedisSessionStore, RedisCache };
