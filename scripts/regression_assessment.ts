/**
 * 答题流程回归测试
 *
 * 前提：begreat 服务必须正在运行（npm run dev 或 ts-node src/apps/begreat/front.ts）
 *
 * 用法：
 *   ENV=development ts-node scripts/regression_assessment.ts
 *   ENV=development ts-node scripts/regression_assessment.ts --keep   # 保留测试 session，不自动清理
 *   ENV=development ts-node scripts/regression_assessment.ts --port 41002
 *
 * 测试覆盖：
 *   [1] 参数校验：非法 gender / 越界 age → 400
 *   [2] 正常答题：60 题分 12 批，全部 Likert 1–5 随机作答
 *   [3] 完成接口：验证返回 personalityLabel / freeSummary / normVersion
 *   [4] 报告接口：免费版字段完整性
 *   [5] 常模字段：normMeta.version 与 session 记录一致
 */

import http from "http";
import * as path from "path";
import Redis from "ioredis";
import mongoose from "mongoose";
import { randomBytes } from "crypto";

// 保存连接引用，避免 import * as mongoose 时 .connection 不稳定
let _db: mongoose.mongo.Db | undefined;

// ── 配置 ─────────────────────────────────────────────────────────────────────

const ENV    = process.env.ENV ?? "development";
const args   = process.argv.slice(2);
const KEEP   = args.includes("--keep");
const portIdx = args.indexOf("--port");
const PORT   = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 41002;
const BASE   = `http://127.0.0.1:${PORT}`;

const cfgPath = path.resolve(__dirname, `../src/apps/begreat/sysconfig/${ENV}/db_config.json`);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cfg = require(cfgPath) as {
  db_global:   { host: string; port: number; db: string; user?: string; password?: string; authSource?: string };
  redis_global: { host: string; port: number; db?: number; user?: string; password?: string };
};

const TEST_OPEN_ID  = `test_regression_${randomBytes(4).toString("hex")}`;
const TEST_TOKEN    = randomBytes(24).toString("hex");
const TOKEN_TTL_SEC = 300;  // 5 分钟，足够跑完测试

// ── 终端色彩 ──────────────────────────────────────────────────────────────────

const C = {
  reset:  "\x1b[0m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  gray:   "\x1b[90m",
  bold:   "\x1b[1m",
};

function ok(msg: string)   { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function fail(msg: string) { console.log(`  ${C.red}✗${C.reset} ${C.red}${msg}${C.reset}`); }
function info(msg: string) { console.log(`  ${C.gray}→ ${msg}${C.reset}`); }
function head(msg: string) { console.log(`\n${C.bold}${C.cyan}${msg}${C.reset}`); }

// ── HTTP 工具 ─────────────────────────────────────────────────────────────────

function request(
  method: string,
  urlPath: string,
  body?: object,
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${TEST_TOKEN}`,
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try   { resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode ?? 0, data: raw }); }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── 断言工具 ──────────────────────────────────────────────────────────────────
// 注：sendErr/sendSucc 均返回 HTTP 200；错误码在 JSON body 的 code 字段

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    ok(label);
    passCount++;
  } else {
    fail(label + (detail ? `  [${detail}]` : ""));
    failCount++;
  }
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, label, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

function assertField(obj: any, field: string, label?: string): void {
  assert(obj?.[field] !== undefined && obj?.[field] !== null, label ?? `has field: ${field}`, `field "${field}" missing`);
}

/** 断言响应为成功（code=200, success=true） */
function assertOk(res: { status: number; data: any }, label: string): boolean {
  const ok_ = res.data?.code === 200 && res.data?.success === true;
  assert(ok_, label, ok_ ? "" : `code=${res.data?.code}, msg=${res.data?.message ?? "-"}`);
  return ok_;
}

/** 断言响应为指定业务错误码（HTTP 永远 200，看 body.code） */
function assertErr(res: { status: number; data: any }, expectedCode: number, label: string): void {
  const actual = res.data?.code;
  assert(actual === expectedCode && res.data?.success === false,
    label,
    `code=${actual}, success=${res.data?.success}`);
}

// ── 测试套件 ──────────────────────────────────────────────────────────────────

const completedSessions: string[] = [];

/** 套件 1：参数校验 */
async function suiteValidation() {
  head("[1] 参数校验");

  // 非法 gender
  const r1 = await request("POST", "/assessment/start", { gender: "unknown", age: 22 });
  assertErr(r1, 400, "非法 gender → code 400");

  // 年龄过小
  const r2 = await request("POST", "/assessment/start", { gender: "male", age: 10 });
  assertErr(r2, 400, "年龄 10 → code 400");

  // 年龄过大
  const r3 = await request("POST", "/assessment/start", { gender: "female", age: 100 });
  assertErr(r3, 400, "年龄 100 → code 400");

  // 缺 gender
  const r4 = await request("POST", "/assessment/start", { age: 25 });
  assertErr(r4, 400, "缺 gender → code 400");
}

/**
 * 套件 2 + 3 + 4：完整答题流程
 * strategy: "random" | "all_min" | "all_max" | "all_mid"
 */
async function suiteFullFlow(gender: "male" | "female", age: number, strategy: "random" | "all_min" | "all_max" | "all_mid" = "random") {
  head(`[2–4] 完整答题（gender=${gender}, age=${age}, strategy=${strategy}）`);
  const t0 = Date.now();

  // ── 开始 ──
  const startRes = await request("POST", "/assessment/start", { gender, age });
  if (!assertOk(startRes, "start → 成功")) {
    fail(`无法继续：start 失败 (${startRes.data?.message ?? "unknown"})`);
    return;
  }

  const { sessionId, totalQuestions, totalBatches } = startRes.data?.data ?? {};
  assert(!!sessionId, `返回 sessionId`);
  assertEq(totalQuestions, 60, `totalQuestions = 60`);
  assertEq(totalBatches, 12,   `totalBatches = 12`);
  info(`sessionId: ${sessionId}`);

  if (!sessionId) { fail("无法继续：缺少 sessionId"); return; }

  // ── 逐批答题 ──
  let totalAnswered = 0;
  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    // GET 批次题目
    const batchRes = await request("GET", `/assessment/batch/${sessionId}/${batchIdx}`);
    assertOk(batchRes, `batch ${batchIdx} GET → 成功`);

    const { questions } = batchRes.data?.data ?? {};
    assert(Array.isArray(questions) && questions.length === 5, `batch ${batchIdx} 返回 5 题`);

    // 检查字段安全性：不应暴露 dimension / modelType / questionId
    const leaked = questions?.some((q: any) => q.dimension || q.modelType || q.questionId);
    assert(!leaked, `batch ${batchIdx} 未暴露 dimension/modelType/questionId`);

    // 构造答案
    const answers = questions?.map((q: any) => ({
      index: q.index,
      score: scoreByStrategy(strategy),
    })) ?? [];

    // POST 答案
    const submitRes = await request("POST", `/assessment/batch/${sessionId}/${batchIdx}`, { answers });
    assertOk(submitRes, `batch ${batchIdx} POST → 成功`);
    assertField(submitRes.data?.data, "savedCount", `batch ${batchIdx} 返回 savedCount`);

    totalAnswered += answers.length;
  }

  info(`已提交 ${totalAnswered} 题答案`);

  // ── 完成 ──
  const completeRes = await request("POST", `/assessment/complete/${sessionId}`);
  assertOk(completeRes, "complete → 成功");
  assertField(completeRes.data?.data, "personalityLabel", "complete 返回 personalityLabel");
  assertField(completeRes.data?.data, "freeSummary",      "complete 返回 freeSummary");
  assertField(completeRes.data?.data, "sessionId",        "complete 返回 sessionId");
  info(`性格标签：${completeRes.data?.data?.personalityLabel}`);
  info(`摘要：${completeRes.data?.data?.freeSummary?.slice(0, 40)}...`);

  // ── 报告（免费版） ──
  const reportRes = await request("GET", `/report/${sessionId}`);
  assertOk(reportRes, "report GET → 成功");
  const rData = reportRes.data?.data ?? {};
  assertField(rData, "personalityLabel", "报告含 personalityLabel");
  assertField(rData, "freeSummary",      "报告含 freeSummary");
  assertField(rData, "topCareers",       "报告含 topCareers");
  assert(Array.isArray(rData.topCareers), "topCareers 为数组");
  if (rData.topCareers.length === 0) {
    info("topCareers 为空（职业库未填充，可忽略）");
  }
  assertEq(rData.isPaid, false, "免费版 isPaid=false");

  // ── normVersion 一致性 ──
  // 注：免费版不返回 normMeta，但 complete 已写入 session，通过 DB 检验
  const normVersion = await getNormVersionFromDB(sessionId);
  assert(typeof normVersion === "string" && normVersion.length > 0, `normVersion 已存入 session: ${normVersion}`);

  const elapsed = Date.now() - t0;
  info(`流程耗时：${elapsed}ms`);
  completedSessions.push(sessionId);
}

/** 套件 5：重复提交 / 边界 */
async function suiteBoundary(sessionId: string) {
  head("[5] 边界测试（使用已完成的 session）");

  // 已完成 session 不能再 complete
  const r1 = await request("POST", `/assessment/complete/${sessionId}`);
  assertErr(r1, 400, "已完成 session 再次 complete → code 400");

  // 不存在的 session
  const r2 = await request("GET", "/report/nonexistent_session_id_xyz");
  assertErr(r2, 404, "不存在 sessionId 的报告 → code 404");

  // batchIndex 越界
  const r3 = await request("GET", `/assessment/batch/${sessionId}/999`);
  assertErr(r3, 400, "越界 batchIndex → code 400");
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

function scoreByStrategy(strategy: string): number {
  if (strategy === "all_min") return 1;
  if (strategy === "all_max") return 5;
  if (strategy === "all_mid") return 3;
  return Math.ceil(Math.random() * 5);  // random 1–5
}

async function getNormVersionFromDB(sessionId: string): Promise<string | null> {
  try {
    const session = await _db?.collection("assessmentsessions").findOne(
      { sessionId },
      { projection: { "result.normVersion": 1 } }
    );
    return (session as any)?.result?.normVersion ?? null;
  } catch { return null; }
}

// ── 清理 ──────────────────────────────────────────────────────────────────────

async function cleanup(redis: Redis) {
  if (KEEP) {
    info(`--keep 模式：保留 ${completedSessions.length} 个测试 session`);
    return;
  }
  head("清理测试数据");
  try {
    // 删除 Redis token
    await redis.del(`auth:token:${TEST_TOKEN}`);
    ok("Redis token 已删除");

    // 删除测试 session
    if (completedSessions.length > 0 && _db) {
      const result = await _db.collection("assessmentsessions").deleteMany({
        sessionId: { $in: completedSessions },
      });
      ok(`MongoDB 测试 session 已删除（${result?.deletedCount ?? 0} 条）`);
    }
  } catch (e) {
    fail(`清理出错：${(e as Error).message}`);
  }
}

// ── 主流程 ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}${C.cyan}════ BeGREAT 答题流程回归测试 ════${C.reset}`);
  console.log(`${C.gray}目标服务：${BASE}${C.reset}`);
  console.log(`${C.gray}测试用户：${TEST_OPEN_ID}${C.reset}`);

  // ── 连接 Redis & 植入测试 token ──
  head("初始化");
  const redis = new Redis({
    host:     cfg.redis_global.host,
    port:     cfg.redis_global.port,
    db:       cfg.redis_global.db ?? 0,
    username: cfg.redis_global.user,
    password: cfg.redis_global.password,
  });

  await redis.set(`auth:token:${TEST_TOKEN}`, TEST_OPEN_ID, "EX", TOKEN_TTL_SEC);
  ok(`测试 token 已植入 Redis（TTL ${TOKEN_TTL_SEC}s）`);

  // ── 连接 MongoDB（仅用于 session 读取与清理） ──
  const { host, port: dbPort, db, user, password, authSource } = cfg.db_global;
  const auth    = user ? `${user}:${password}@` : "";
  const authSrc = authSource ? `?authSource=${authSource}` : "";
  await mongoose.connect(`mongodb://${auth}${host}:${dbPort}/${db}${authSrc}`);
  _db = mongoose.connection.db;
  ok("MongoDB 已连接");

  // ── 检查服务是否在线 ──
  try {
    await request("GET", "/report/ping_test_nonexistent");
    ok(`服务在线 (${BASE})`);
  } catch {
    fail(`无法连接服务 ${BASE}，请确认服务正在运行`);
    await cleanup(redis);
    await mongoose.disconnect();
    redis.disconnect();
    process.exit(1);
  }

  // ── 跑测试套件 ──
  try {
    await suiteValidation();
    await suiteFullFlow("male",   22, "random");
    await suiteFullFlow("female", 35, "all_mid");
    await suiteFullFlow("male",   45, "all_max");

    if (completedSessions.length > 0) {
      await suiteBoundary(completedSessions[0]);
    }
  } catch (err) {
    fail(`测试异常中断：${(err as Error).message}`);
    console.error(err);
  }

  // ── 汇总 ──
  const total = passCount + failCount;
  console.log(`\n${C.bold}════ 测试结果 ════${C.reset}`);
  console.log(`${C.green}通过：${passCount}${C.reset}  ${failCount > 0 ? C.red : C.gray}失败：${failCount}${C.reset}  总计：${total}`);

  // ── 清理 ──
  await cleanup(redis);
  await mongoose.disconnect();
  redis.disconnect();

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("脚本异常：", err);
  process.exit(1);
});
