/**
 * 从真实 session 数据重算 BFI-2 经验常模，写入新版本
 *
 * 用法：
 *   ENV=development ts-node scripts/recalculate_norms.ts --dry-run
 *   ENV=development ts-node scripts/recalculate_norms.ts --activate
 *
 * 逻辑：
 *   1. 取所有 status=completed 的 session，读取 big5Scores（领域均分 1–5）
 *   2. 按 dimension × gender × ageGroup 分组，计算 mean / sd
 *   3. 写入 norms 集合，normVersion = empirical_<YYYYMMDD>
 *   4. --activate 参数：将新版本设为激活版本
 *
 * 最低样本量：每组 < MIN_SAMPLE 时保留论文常模（不覆盖）
 */
import * as path from "path";
import * as mongoose from "mongoose";

const MIN_SAMPLE = 30;  // 低于此数量的分组不输出，避免小样本失真

const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const NORM_VERSION = `empirical_${TODAY}`;
const INSTRUMENT = "BFI2_CN_60";

type AgeGroup = "18-24" | "25-34" | "35-44" | "45+";
type Gender = "male" | "female" | "all";

function getAgeGroup(age: number): AgeGroup {
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  return "45+";
}

/** 计算均值和无偏标准差 */
function meanSd(values: number[]): [number, number] {
  const n = values.length;
  if (n < 2) return [values[0] ?? 0, 0];
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return [
    parseFloat(mean.toFixed(4)),
    parseFloat(Math.sqrt(variance).toFixed(4)),
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun   = args.includes("--dry-run");
  const activate = args.includes("--activate");

  const env = process.env.ENV ?? "development";
  const configPath = path.resolve(__dirname, `../src/apps/begreat/sysconfig/${env}/db_config.json`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbCfg = (require(configPath) as { db_global: { host: string; port: number; db: string; user?: string; password?: string; authSource?: string } }).db_global;

  const auth    = dbCfg.user ? `${dbCfg.user}:${dbCfg.password}@` : "";
  const authSrc = dbCfg.authSource ? `?authSource=${dbCfg.authSource}` : "";
  const url     = `mongodb://${auth}${dbCfg.host}:${dbCfg.port}/${dbCfg.db}${authSrc}`;

  console.log(`\n连接 ${dbCfg.host}:${dbCfg.port}/${dbCfg.db} ...`);
  const conn = await mongoose.connect(url);
  console.log("已连接。");

  const SessionSchema = new mongoose.Schema({}, { strict: false, collection: "assessmentsessions" });
  const NormSchema    = new mongoose.Schema({}, { strict: false, collection: "norms" });
  const Sessions = conn.model("_RecalcSession", SessionSchema);
  const NormModel = conn.model("_RecalcNorm",   NormSchema);

  // ── 1. 读取已完成 session ─────────────────────────────────────────────────
  const sessions = await Sessions.find({
    status: { $in: ["completed", "paid"] },
    "result.big5Scores": { $exists: true },
  })
    .select("userProfile result.big5Scores")
    .lean()
    .exec() as Array<{
      userProfile: { gender: "male" | "female"; age: number };
      result: { big5Scores: Record<string, number> };
    }>;

  console.log(`\n读取到 ${sessions.length} 条已完成 session。`);

  if (sessions.length < MIN_SAMPLE) {
    console.warn(`样本量不足 ${MIN_SAMPLE}，建议先积累数据再运行本脚本。`);
    await mongoose.disconnect();
    return;
  }

  // ── 2. 按 dimension × gender × ageGroup 分组 ─────────────────────────────
  const dims = ["O", "C", "E", "A", "N"];
  const genders: Gender[] = ["all", "male", "female"];
  const ageGroups: AgeGroup[] = ["18-24", "25-34", "35-44", "45+"];

  // bucket key: `dim|gender|ageGroup`
  const buckets = new Map<string, number[]>();

  for (const s of sessions) {
    const g  = s.userProfile.gender;
    const ag = getAgeGroup(s.userProfile.age);
    for (const dim of dims) {
      const score = s.result.big5Scores?.[dim];
      if (score == null) continue;
      // all 组
      const keyAll = `${dim}|all|${ag}`;
      if (!buckets.has(keyAll)) buckets.set(keyAll, []);
      buckets.get(keyAll)!.push(score);
      // 性别组
      const keyG = `${dim}|${g}|${ag}`;
      if (!buckets.has(keyG)) buckets.set(keyG, []);
      buckets.get(keyG)!.push(score);
    }
  }

  // ── 3. 构建文档 ───────────────────────────────────────────────────────────
  const docs: object[] = [];
  let skipped = 0;

  for (const dim of dims) {
    for (const gender of genders) {
      for (const ageGroup of ageGroups) {
        const key = `${dim}|${gender}|${ageGroup}`;
        const values = buckets.get(key) ?? [];
        if (values.length < MIN_SAMPLE) { skipped++; continue; }
        const [mean, sd] = meanSd(values);
        docs.push({
          normVersion: NORM_VERSION,
          source:      `Empirical, ${NORM_VERSION}, n=${values.length}`,
          instrument:  INSTRUMENT,
          modelType:   "BIG5",
          dimension:   dim,
          gender,
          ageGroup,
          mean,
          sd,
          sampleSize:  values.length,
          isActive:    false,
        });
      }
    }
  }

  console.log(`\n常模版本：${NORM_VERSION}`);
  console.log(`有效分组：${docs.length} 条，跳过（样本 < ${MIN_SAMPLE}）：${skipped} 组`);

  if (dryRun) {
    console.log("\n[dry-run] 样本文档：", JSON.stringify(docs[0] ?? {}, null, 2));
    console.log("[dry-run] 未写入数据库。");
    await mongoose.disconnect();
    return;
  }

  if (docs.length === 0) {
    console.warn("没有满足最低样本量的分组，退出。");
    await mongoose.disconnect();
    return;
  }

  // 版本已存在则跳过
  const existing = await NormModel.countDocuments({ normVersion: NORM_VERSION });
  if (existing > 0) {
    console.log(`版本 ${NORM_VERSION} 已存在（${existing} 条），跳过写入。`);
  } else {
    await NormModel.insertMany(docs);
    console.log(`✓ 写入 ${docs.length} 条经验常模。`);
  }

  if (activate) {
    await NormModel.updateMany({ modelType: "BIG5", isActive: true }, { $set: { isActive: false } });
    await NormModel.updateMany({ normVersion: NORM_VERSION }, { $set: { isActive: true } });
    console.log(`✓ 已激活版本：${NORM_VERSION}`);
  } else {
    console.log(`\n提示：此版本尚未激活。加 --activate 参数后重跑可激活。`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("重算失败：", err);
  process.exit(1);
});
