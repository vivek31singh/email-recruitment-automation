import Redis from 'ioredis';
import { redisConnection } from '../../queue/connection'; // your config
const redis = new Redis(redisConnection);

export const setHistoryId = async (email: string, historyId: string) => {
  await redis.set(`gmail:history:${email}`, historyId);
};
