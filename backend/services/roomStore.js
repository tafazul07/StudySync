import { getRedisClient } from './redisService.js';

const ROOM_TTL = 60 * 60 * 24; // 24h safety expiry for abandoned room keys
const MAX_CHATS = 100;

const usersKey = (roomId) => `room:${roomId}:users`;
const chatsKey = (roomId) => `room:${roomId}:chats`;

/**
 * Shared WebRTC room state in Redis so every backend instance sees the same
 * participants and chat history behind the load balancer.
 */
export class RedisRoomStore {
  async addUser(roomId, socketId) {
    const client = getRedisClient();
    await client.sAdd(usersKey(roomId), socketId);
    await client.expire(usersKey(roomId), ROOM_TTL);
  }

  async removeUser(roomId, socketId) {
    const client = getRedisClient();
    await client.sRem(usersKey(roomId), socketId);
    const remaining = await client.sCard(usersKey(roomId));
    if (remaining === 0) {
      await client.del([usersKey(roomId), chatsKey(roomId)]);
    }
    return remaining;
  }

  async getUsers(roomId) {
    const client = getRedisClient();
    return client.sMembers(usersKey(roomId));
  }

  async addChat(roomId, message) {
    const client = getRedisClient();
    await client.rPush(chatsKey(roomId), JSON.stringify(message));
    await client.lTrim(chatsKey(roomId), -MAX_CHATS, -1);
    await client.expire(chatsKey(roomId), ROOM_TTL);
  }

  async getChats(roomId) {
    const client = getRedisClient();
    const raw = await client.lRange(chatsKey(roomId), 0, -1);
    return raw.map((entry) => JSON.parse(entry));
  }
}

export default new RedisRoomStore();
