import Redis from "ioredis";
import { ComponentManager, EComName } from "../common/BaseComponent";

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
    throw new Error("redis_global config is missing");
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
// 临时 token 过期时间：10 分钟（用于微信登录后绑定/注册流程）
const DEFAULT_TEMP_TOKEN_TTL_SEC = 10 * 60;

export async function saveTokenUserId(
  token: string,
  userId: string,
  ttlSec: number = DEFAULT_TOKEN_TTL_SEC,
): Promise<void> {
  const client = getRedis();
  const key = `auth:token:${token}`;
  await client.set(key, userId, "EX", ttlSec);
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

export async function saveTempTokenOpenId(
  tempToken: string,
  openId: string,
  ttlSec: number = DEFAULT_TEMP_TOKEN_TTL_SEC,
): Promise<void> {
  const client = getRedis();
  const key = `auth:temp:${tempToken}`;
  await client.set(key, openId, "EX", ttlSec);
}

// ── 每日分析配额 ──────────────────────────────────────────────────────────────

const HEAL_LIMIT_KEY = "sys:heal_daily_limit";
const DEFAULT_HEAL_DAILY_LIMIT = 3;

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
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD (UTC)
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

/** 自增今日用量，返回自增后的值，首次使用时设置到次日零点的 TTL */
export async function incrementHealDailyUsage(userId: string): Promise<number> {
  const client = getRedis();
  const key = `heal:daily:${userId}:${todayDateStr()}`;
  const count = await client.incr(key);
  if (count === 1) {
    await client.expire(key, secondsUntilUtcMidnight());
  }
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
    result[id] = values[i] !== null ? parseInt(values[i]!, 10) : 0;
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
    await client.set(key, String(count), "EX", secondsUntilUtcMidnight());
  }
}

/**
 * 读取并删除临时 token 对应的 openId（一次性）
 */
export async function loadOpenIdByTempToken(
  tempToken: string,
): Promise<string | null> {
  const client = getRedis();
  const key = `auth:temp:${tempToken}`;
  const openId = await client.get(key);
  if (openId) {
    await client.del(key);
  }
  return openId;
}

