import Redis from 'ioredis';
import { redisConnection } from '../queue/connection'; // your config
const redis = new Redis(redisConnection);

export const getHistoryId = async (email: string): Promise<string | null> => {
  return await redis.get(`gmail:history:${email}`);
};
