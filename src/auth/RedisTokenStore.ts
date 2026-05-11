import Redis from 'ioredis';
import { ComponentManager, EComName } from '../common/BaseComponent';

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const sysCfg = ComponentManager.instance.getComponent(
    EComName.SysCfgComponent,
  );
  const cfg = sysCfg.redis_global;
  if (!cfg) {
    throw new Error('redis_global config is missing');
  }

  redisClient = new Redis({
    host: cfg.host,
    port: cfg.port,
    db: cfg.db ?? 0,
    username: cfg.user,
    password: cfg.password,
  });

  return redisClient;
}

// 默认 token 过期时间：7 天（可后续从 server_auth_config 读取）
const DEFAULT_TOKEN_TTL_SEC = 7 * 24 * 60 * 60;

export async function saveTokenUserId(
  token: string,
  userId: string,
  ttlSec: number = DEFAULT_TOKEN_TTL_SEC,
): Promise<void> {
  const client = getRedis();
  const key = `auth:token:${token}`;
  await client.set(key, userId, 'EX', ttlSec);
}

export async function loadUserIdByToken(
  token: string,
): Promise<string | null> {
  const client = getRedis();
  const key = `auth:token:${token}`;
  return client.get(key);
}

export async function revokeToken(token: string): Promise<void> {
  const client = getRedis();
  const key = `auth:token:${token}`;
  await client.del(key);
}

// ── 每日分析配额 ──────────────────────────────────────────────────────────────

const HEAL_LIMIT_KEY = 'sys:heal_daily_limit';
const DEFAULT_HEAL_DAILY_LIMIT = 100;

export async function getHealDailyLimit(): Promise<number> {
  const client = getRedis();
  const val = await client.get(HEAL_LIMIT_KEY);
  return val !== null ? parseInt(val, 10) : DEFAULT_HEAL_DAILY_LIMIT;
}

export async function setHealDailyLimit(limit: number): Promise<void> {
  const client = getRedis();
  await client.set(HEAL_LIMIT_KEY, String(limit));
}

function todayDateStr(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD (UTC)
}

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

export async function getHealDailyUsage(userId: string): Promise<number> {
  const client = getRedis();
  const key = `heal:daily:${userId}:${todayDateStr()}`;
  const val = await client.get(key);
  return val !== null ? parseInt(val, 10) : 0;
}

// 原子地 INCR + EXPIRE（首次创建时）：防止进程崩溃在两步之间导致 key 永不过期
const INCR_WITH_EXPIRE_LUA = `
  local v = redis.call("INCR", KEYS[1])
  if v == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
  return v
`;

/** 自增今日用量，返回自增后的值，首次使用时原子设置到次日零点的 TTL */
export async function incrementHealDailyUsage(userId: string): Promise<number> {
  const client = getRedis();
  const key = `heal:daily:${userId}:${todayDateStr()}`;
  const count = await client.eval(INCR_WITH_EXPIRE_LUA, 1, key, String(secondsUntilUtcMidnight())) as number;
  return count;
}

/** 批量读取多个用户今日用量（mget 一次请求） */
export async function getHealDailyUsageBatch(userIds: string[]): Promise<Record<string, number>> {
  if (userIds.length === 0) return {};
  const client = getRedis();
  const date = todayDateStr();
  const keys = userIds.map((id) => `heal:daily:${id}:${date}`);
  const values = await client.mget(...keys);
  const result: Record<string, number> = {};
  userIds.forEach((id, i) => {
    const val = values[i];
    result[id] = val !== null && val !== undefined ? parseInt(val, 10) : 0;
  });
  return result;
}

/** 手动设置某用户今日用量（管理员调整用），设为 0 时删除 key */
export async function setHealDailyUsage(userId: string, count: number): Promise<void> {
  const client = getRedis();
  const key = `heal:daily:${userId}:${todayDateStr()}`;
  if (count <= 0) {
    await client.del(key);
  } else {
    await client.set(key, String(count), 'EX', secondsUntilUtcMidnight());
  }
}
