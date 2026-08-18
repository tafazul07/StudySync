import { createAdapter } from '@socket.io/redis-adapter';
import { getRedisClient } from './redisService.js';
import logger from './logger.js';

/**
 * Attach the Redis pub/sub adapter so Socket.io events (signaling, chat) are
 * broadcast across every backend instance instead of staying process-local.
 */
export async function attachRedisAdapter(io) {
  const pubClient = getRedisClient().duplicate();
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => logger.error('Socket.io Redis pub error', { error: err.message }));
  subClient.on('error', (err) => logger.error('Socket.io Redis sub error', { error: err.message }));

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  logger.info('Socket.io Redis adapter attached');
}
