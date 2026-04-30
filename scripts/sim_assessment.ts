/**
 * 开发环境测试号模拟答题脚本
 *
 * 将指定 openId 的测试账号走完完整的 60 题评测流程，结果留在数据库，
 * 在小程序里用该测试号登录后即可直接看到报告，无需手动点击。
 *
 * 用法：
 *   ENV=development ts-node scripts/sim_assessment.ts --openid <your_test_openid>
 *   ENV=development ts-node scripts/sim_assessment.ts --openid <id> --strategy all_max
 *   ENV=development ts-node scripts/sim_assessment.ts --openid <id> --gender female --age 28
 *   ENV=development ts-node scripts/sim_assessment.ts --openid <id> --type BFI2_FREE
 *
 * 答题策略（--strategy）：
 *   random   随机 1-5（默认）
 *   all_max  全 5 分（高开放性）
 *   all_min  全 1 分（低分策略）
 *   all_mid  全 3 分（中庸）
 *   high_o   开放性维度高，其余随机
 *
 * 选项：
 *   --openid  <id>      测试号 openId（必填）
 *   --gender  <m|f>     male/female，默认 male
 *   --age     <n>       年龄，默认 25
 *   --type    <type>    BFI2 | BFI2_FREE，默认 BFI2
 *   --strategy <s>      答题策略，默认 random
 *   --port    <n>       miniapp 服务端口，默认 41002
 *   --token   <tok>     复用已有 token（跳过 Redis 写入）
 */

import http from 'http';
import * as path from 'path';
import Redis from 'ioredis';
import mongoose from 'mongoose';
import { randomBytes } from 'crypto';

// ── 解析 CLI 参数 ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string, fallback?: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : fallback;
}

const OPEN_ID  = getArg('--openid');
const PORT     = parseInt(getArg('--port', '41002')!, 10);
const GENDER   = getArg('--gender', 'male') as 'male' | 'female';
const AGE      = parseInt(getArg('--age', '25')!, 10);
const TYPE     = getArg('--type', 'BFI2') as 'BFI2' | 'BFI2_FREE';
const STRATEGY = getArg('--strategy', 'random') as Strategy;
const BASE     = `http://127.0.0.1:${PORT}`;
const ENV      = process.env.ENV ?? 'development';

if (!OPEN_ID) {
  console.error('缺少 --openid 参数，用法：ts-node scripts/sim_assessment.ts --openid <your_test_openid>');
  process.exit(1);
}

// ── 配置读取 ───────────────────────────────────────────────────────────────────

const cfgPath = path.resolve(__dirname, `../src/apps/begreat/sysconfig/${ENV}/db_config.json`);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cfg = require(cfgPath) as {
  db_global:    { host: string; port: number; db: string; user?: string; password?: string; authSource?: string };
  redis_global: { host: string; port: number; db?: number; user?: string; password?: string };
};

// ── 类型 ───────────────────────────────────────────────────────────────────────

type Strategy = 'random' | 'all_max' | 'all_min' | 'all_mid' | 'high_o';

// ── 终端色彩 ───────────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  bold:   '\x1b[1m',
  blue:   '\x1b[34m',
  magenta: '\x1b[35m',
};

const ok   = (msg: string) => console.log(`  ${C.green}✓${C.reset} ${msg}`);
const fail = (msg: string) => console.log(`  ${C.red}✗${C.reset} ${C.red}${msg}${C.reset}`);
const info = (msg: string) => console.log(`  ${C.gray}→ ${msg}${C.reset}`);
const head = (msg: string) => console.log(`\n${C.bold}${C.cyan}▶ ${msg}${C.reset}`);
const kv   = (k: string, v: string) => console.log(`  ${C.blue}${k.padEnd(16)}${C.reset}${v}`);

// ── HTTP 工具 ──────────────────────────────────────────────────────────────────

let _token = getArg('--token', randomBytes(24).toString('hex'))!;

function request(
  method: string,
  urlPath: string,
  body?: object,
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: PORT,
      path: urlPath,
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${_token}`,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try   { resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode ?? 0, data: raw }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function unwrap(res: { status: number; data: any }, label: string): any {
  if (res.data?.code !== 200 || !res.data?.success) {
    throw new Error(`${label} 失败: code=${res.data?.code}, msg=${res.data?.message ?? res.data}`);
  }
  return res.data.data;
}

// ── 答题策略 ───────────────────────────────────────────────────────────────────

const QUESTION_COUNT_TOTAL = 60;

// BFI-2 题目编号到维度的映射（用于 high_o 策略）
// O: 1,6,11,16,21,26,31,36,41,46,51,56
const OPENNESS_ITEM_NOS = new Set([1,6,11,16,21,26,31,36,41,46,51,56]);

function scoreByStrategy(strategy: Strategy, questionIndex: number): number {
  switch (strategy) {
    case 'all_max': return 5;
    case 'all_min': return 1;
    case 'all_mid': return 3;
    case 'high_o':
      // 开放性题目给高分，其余随机
      return OPENNESS_ITEM_NOS.has(questionIndex) ? 5 : Math.ceil(Math.random() * 3) + 1;
    default:
      return Math.ceil(Math.random() * 5);
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}${C.cyan}════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.cyan}   BeGREAT 开发测试号模拟答题脚本${C.reset}`);
  console.log(`${C.bold}${C.cyan}════════════════════════════════════════${C.reset}`);

  console.log('');
  kv('OpenID',   OPEN_ID!);
  kv('性别',     GENDER === 'male' ? '男' : '女');
  kv('年龄',     String(AGE));
  kv('测评类型', TYPE);
  kv('答题策略', STRATEGY);
  kv('服务端口', String(PORT));
  kv('Token',    _token.slice(0, 12) + '...');

  // ── Step 1: 植入 Redis token ──────────────────────────────────────────────
  head('Step 1  植入 Redis token');

  const redis = new Redis({
    host:     cfg.redis_global.host,
    port:     cfg.redis_global.port,
    db:       cfg.redis_global.db ?? 0,
    username: cfg.redis_global.user,
    password: cfg.redis_global.password,
  });

  const TOKEN_TTL = 7 * 24 * 60 * 60; // 7天
  await redis.set(`auth:token:${_token}`, OPEN_ID!, 'EX', TOKEN_TTL);
  ok(`token 已写入 Redis（TTL 7天），openId → ${OPEN_ID}`);

  // ── Step 2: 检查服务在线 ───────────────────────────────────────────────────
  head('Step 2  检查服务连通性');

  try {
    await request('GET', '/report/ping_connectivity_check_xyz');
    ok(`miniapp 服务在线 (${BASE})`);
  } catch {
    fail(`无法连接 ${BASE}，请先启动 begreat 服务：`);
    console.log(`    ${C.gray}ENV=${ENV} npx ts-node src/apps/begreat/front.ts${C.reset}`);
    redis.disconnect();
    process.exit(1);
  }

  // ── Step 3: 开始评测 ───────────────────────────────────────────────────────
  head('Step 3  开始评测');

  const startRes = await request('POST', '/assessment/start', {
    gender:         GENDER,
    age:            AGE,
    assessmentType: TYPE,
  });
  const startData = unwrap(startRes, 'assessment/start');
  const { sessionId, totalQuestions, totalBatches } = startData;
  ok(`session 创建成功`);
  kv('  sessionId',      sessionId);
  kv('  totalQuestions', String(totalQuestions));

  // ── Step 4: 获取全部题目 ───────────────────────────────────────────────────
  head('Step 4  获取全部题目');

  const qRes  = await request('GET', `/assessment/questions/${sessionId}`);
  const qData = unwrap(qRes, 'assessment/questions');
  const questions: { index: number; content: string }[] = qData.questions;
  ok(`获取 ${questions.length} 道题目`);

  // ── Step 5: 构造答案 ───────────────────────────────────────────────────────
  head('Step 5  构造答案');

  const answers = questions.map((q) => ({
    index: q.index,
    score: scoreByStrategy(STRATEGY, q.index),
  }));

  const scoreDistrib: Record<number, number> = { 1:0, 2:0, 3:0, 4:0, 5:0 };
  for (const a of answers) { scoreDistrib[a.score]++; }
  info(`分数分布：${Object.entries(scoreDistrib).map(([k,v]) => `${k}分×${v}`).join('  ')}`);

  // ── Step 6: 提交全部答案并完成 ─────────────────────────────────────────────
  head('Step 6  提交答案并计算结果');

  const t0          = Date.now();
  const completeRes = await request('POST', `/assessment/complete/${sessionId}`, { answers });
  const elapsed     = Date.now() - t0;
  const complData   = unwrap(completeRes, 'assessment/complete');

  ok(`计算完成（${elapsed}ms）`);

  // ── Step 7: 标记已支付（仅 BFI2 完整版）─────────────────────────────────────
  if (TYPE === 'BFI2') {
    head('Step 7  标记已支付');

    const { host, port: dbPort, db, user, password, authSource } = cfg.db_global;
    const auth    = user ? `${encodeURIComponent(user)}:${encodeURIComponent(password!)}@` : '';
    const authSrc = authSource ? `?authSource=${authSource}` : '';
    await mongoose.connect(`mongodb://${auth}${host}:${dbPort}/${db}${authSrc}`);

    const result = await mongoose.connection.db!
      .collection('assessmentsessions')
      .updateOne(
        { sessionId },
        { $set: { status: 'paid', paidAt: new Date() } },
      );

    await mongoose.disconnect();

    if (result.modifiedCount === 1) {
      ok(`session status → paid`);
    } else {
      fail(`updateOne 未命中（modifiedCount=${result.modifiedCount}），请检查 sessionId`);
    }
  }

  // ── Step 8: 展示结果 ───────────────────────────────────────────────────────
  head('Step 8  评测结果');

  console.log('');
  console.log(`  ${C.bold}${C.magenta}性格标签：${complData.personalityLabel ?? '—'}${C.reset}`);
  console.log('');
  if (complData.freeSummary) {
    const lines: string[] = (complData.freeSummary as string).match(/.{1,40}/g) ?? [];
    for (const line of lines) {
      console.log(`  ${C.gray}${line}${C.reset}`);
    }
    console.log('');
  }

  if (Array.isArray(complData.topCareers) && complData.topCareers.length > 0) {
    console.log(`  ${C.bold}推荐职业（Top ${complData.topCareers.length}）：${C.reset}`);
    for (const career of complData.topCareers.slice(0, 5)) {
      const score = typeof career.matchScore === 'number'
        ? ` ${C.green}${career.matchScore.toFixed(1)}分${C.reset}`
        : '';
      console.log(`    ${C.cyan}▪ ${career.title}${C.reset}${score}`);
    }
    console.log('');
  }

  // ── Step 9: 拉取报告详情 ───────────────────────────────────────────────────
  if (TYPE === 'BFI2') {
    head('Step 9  报告详情（GET /report）');

    const reportRes  = await request('GET', `/report/${sessionId}`);
    const reportData = unwrap(reportRes, 'report');

    if (reportData.big5Normalized) {
      console.log(`  ${C.bold}Big5 标准分：${C.reset}`);
      const dims: Record<string, string> = { O:'开放性', C:'尽责性', E:'外向性', A:'宜人性', N:'情绪稳定性' };
      for (const [dim, name] of Object.entries(dims)) {
        const z = reportData.big5Normalized[dim];
        if (z !== undefined) {
          const bar = z >= 0
            ? `${'█'.repeat(Math.min(Math.round(z * 3), 10))}${C.reset}`
            : `${C.red}${'▒'.repeat(Math.min(Math.round(-z * 3), 10))}${C.reset}`;
          console.log(`    ${C.cyan}${name.padEnd(6)}${C.reset}  z=${z.toFixed(2).padStart(6)}  ${z >= 0 ? C.green : C.red}${bar}`);
        }
      }
      console.log('');
    }

    kv('  isPaid',  reportData.isPaid ? `${C.green}true ✓${C.reset}` : `${C.red}false${C.reset}`);
    kv('  normVer', reportData.normMeta?.version ?? '—');
  }

  // ── 完成摘要 ───────────────────────────────────────────────────────────────
  head('完成');

  console.log('');
  console.log(`  ${C.bold}${C.green}模拟答题已完成，结果已落库。${C.reset}`);
  console.log('');
  kv('openId',    OPEN_ID!);
  kv('sessionId', sessionId);
  kv('token',     _token);
  console.log('');
  console.log(`  ${C.gray}在小程序用该测试号登录，进入"我的"→"测评记录"即可看到结果。${C.reset}`);
  console.log(`  ${C.gray}token 有效期 7 天，7 天内无需重新写入。${C.reset}`);
  console.log('');

  redis.disconnect();
}

main().catch((err) => {
  console.error(`\n${C.red}脚本执行失败：${C.reset}`, err.message ?? err);
  process.exit(1);
});
