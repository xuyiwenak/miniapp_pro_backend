import { randomBytes } from 'crypto';
import type Redis from 'ioredis';
import { hashToken } from './tokenHash';

/** Apps supply their own namespace; Redis only holds hashes of bearer tokens. */
export function createRedisSessionStore(redis: Redis, namespace: string, ttlSeconds: number) {
  const key = (token: string) => `${namespace}:session:${hashToken(token)}`;
  return {
    async issue(value: string) {
      const token = randomBytes(32).toString('base64url');
      await redis.set(key(token), value, 'EX', ttlSeconds);
      return token;
    },
    read: (token: string) => redis.get(key(token)),
    revoke: (token: string) => redis.del(key(token)),
  };
}
