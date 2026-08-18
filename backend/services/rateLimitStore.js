import { RedisStore } from 'rate-limit-redis';
import { getRedisClient } from './redisService.js';
import logger from './logger.js';

/**
 * Rate limit counters shared across backend instances. Without this each
 * instance keeps its own counter, so a limit of N becomes N * instanceCount.
 * Returns undefined when Redis is unavailable so express-rate-limit falls back
 * to its in-memory store.
 */
export function createRateLimitStore(prefix) {
  try {
    const client = getRedisClient();
    return new RedisStore({
      prefix: `ratelimit:${prefix}:`,
      sendCommand: (...args) => client.sendCommand(args),
    });
  } catch (err) {
    logger.warn('Redis rate limit store unavailable, using in-memory store', { error: err.message });
    return undefined;
  }
}
