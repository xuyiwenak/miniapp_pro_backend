import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { createRedisSessionStore } from '../../../shared/auth/redisSessionStore';
import { hashToken } from '../../../shared/auth/tokenHash';
import { LIMITS } from '../config';
import { SmartCourseError } from '../errors';
import { SessionSchema, type Session } from '../schemas';

const NAMESPACE = 'smartCourse';
const RELEASE_LOCK = "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) end return 0";
const RATE_SCRIPT = [
  "local n=redis.call('incr',KEYS[1]);",
  "if n==1 then redis.call('expire',KEYS[1],ARGV[1]) end return n",
].join(' ');
export function createAccess(redis: Redis) {
  const store = createRedisSessionStore(redis, NAMESPACE, LIMITS.sessionSeconds);
  return {
    issue: (session: Session) => store.issue(JSON.stringify(session)),
    revoke: store.revoke,
    async authenticate(token: string, role: Session['role']) {
      const raw = token ? await store.read(token) : null;
      const session = raw ? SessionSchema.safeParse(JSON.parse(raw)) : null;
      if (!session?.success || session.data.role !== role) {
        throw new SmartCourseError(401, 'UNAUTHORIZED', '请重新进入课程或登录');
      }
      return session.data;
    },
    async rate(key: string, maximum: number) {
      const count = Number(await redis.eval(RATE_SCRIPT, 1,
        `${NAMESPACE}:rate:${hashToken(key)}`, LIMITS.rateWindowSeconds));
      if (count > maximum) throw new SmartCourseError(429, 'RATE_LIMIT', '请求较多，请稍后再试');
    },
    async withLock<T>(key: string, action: () => Promise<T>): Promise<T> {
      const lockKey = `${NAMESPACE}:lock:${key}`;
      const owner = randomUUID();
      const locked = await redis.set(lockKey, owner, 'EX', LIMITS.lockSeconds, 'NX');
      if (!locked) throw new SmartCourseError(409, 'BUSY', '上一条请求正在处理，请稍后查看');
      try { return await action(); }
      finally { await redis.eval(RELEASE_LOCK, 1, lockKey, owner); }
    },
  };
}
export type Access = ReturnType<typeof createAccess>;
