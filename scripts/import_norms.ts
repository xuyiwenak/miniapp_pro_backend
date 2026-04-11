/**
 * 将参考常模导入数据库
 *
 * 用法：
 *   ENV=development ts-node scripts/import_norms.ts
 *   ENV=development ts-node scripts/import_norms.ts --dry-run
 *   ENV=development ts-node scripts/import_norms.ts --activate  # 导入并设为激活版本
 *
 * normVersion 格式：ref_<来源>_<YYYYMMDD>
 */
import * as path from "path";
import * as mongoose from "mongoose";
import type { AgeGroup, NormGender } from "../src/apps/begreat/entity/norm.entity";

// ── 常模数据 ─────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const NORM_VERSION = `ref_zhang2021_${TODAY}`;
const SOURCE = "Zhang et al., Assessment 2021, Chinese college sample";
const INSTRUMENT = "BFI2_CN_60";

/**
 * BFI-2 五领域常模（Zhang 等 2021，中国大学生样本）
 * 维度均分量纲：12 题反向计分后算术均值，理论范围 1–5
 * 请用论文 Table 1 精确值替换下方数字，并更新 sampleSize
 */
const BIG5_PAPER_NORMS: {
  dimension: string;
  gender: NormGender;
  mean: number;
  sd: number;
  sampleSize: number | null;
}[] = [
  // O 开放性
  { dimension: "O", gender: "all",    mean: 3.42, sd: 0.64, sampleSize: null },
  { dimension: "O", gender: "male",   mean: 3.38, sd: 0.65, sampleSize: null },
  { dimension: "O", gender: "female", mean: 3.44, sd: 0.63, sampleSize: null },
  // C 尽责性
  { dimension: "C", gender: "all",    mean: 3.55, sd: 0.61, sampleSize: null },
  { dimension: "C", gender: "male",   mean: 3.48, sd: 0.63, sampleSize: null },
  { dimension: "C", gender: "female", mean: 3.54, sd: 0.61, sampleSize: null },
  // E 外向性
  { dimension: "E", gender: "all",    mean: 3.31, sd: 0.69, sampleSize: null },
  { dimension: "E", gender: "male",   mean: 3.33, sd: 0.72, sampleSize: null },
  { dimension: "E", gender: "female", mean: 3.25, sd: 0.69, sampleSize: null },
  // A 宜人性
  { dimension: "A", gender: "all",    mean: 3.68, sd: 0.57, sampleSize: null },
  { dimension: "A", gender: "male",   mean: 3.55, sd: 0.60, sampleSize: null },
  { dimension: "A", gender: "female", mean: 3.68, sd: 0.57, sampleSize: null },
  // N 负性情绪
  { dimension: "N", gender: "all",    mean: 2.82, sd: 0.76, sampleSize: null },
  { dimension: "N", gender: "male",   mean: 2.75, sd: 0.77, sampleSize: null },
  { dimension: "N", gender: "female", mean: 2.96, sd: 0.74, sampleSize: null },
];

// BFI-2 目前暂不区分年龄段（大学生样本），全部填同一组数据
const AGE_GROUPS: AgeGroup[] = ["18-24", "25-34", "35-44", "45+"];

function buildDocs() {
  const docs = [];
  for (const row of BIG5_PAPER_NORMS) {
    for (const ageGroup of AGE_GROUPS) {
      docs.push({
        normVersion: NORM_VERSION,
        source:      SOURCE,
        instrument:  INSTRUMENT,
        modelType:   "BIG5" as const,
        dimension:   row.dimension,
        gender:      row.gender,
        ageGroup,
        mean:        row.mean,
        sd:          row.sd,
        sampleSize:  row.sampleSize,
        isActive:    false,  // 导入后手动或用 --activate 激活
      });
    }
  }
  return docs;
}

// ── 主流程 ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun   = args.includes("--dry-run");
  const activate = args.includes("--activate");

  const docs = buildDocs();

  console.log(`\n常模版本：${NORM_VERSION}`);
  console.log(`共 ${docs.length} 条（${BIG5_PAPER_NORMS.length} 维度×性别组 × ${AGE_GROUPS.length} 年龄段）`);

  if (dryRun) {
    console.log("\n[dry-run] 样本：", JSON.stringify(docs[0], null, 2));
    console.log("[dry-run] 未写入数据库。");
    return;
  }

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

  const NormSchema = new mongoose.Schema({}, { strict: false, collection: "norms" });
  const NormModel = conn.model("_ImportNorm", NormSchema);

  // 检查版本是否已存在
  const existing = await NormModel.countDocuments({ normVersion: NORM_VERSION });
  if (existing > 0) {
    console.log(`\n版本 ${NORM_VERSION} 已存在（${existing} 条），跳过写入。`);
  } else {
    await NormModel.insertMany(docs);
    console.log(`✓ 写入 ${docs.length} 条常模数据。`);
  }

  if (activate) {
    // 将旧版本全部置为 inactive，再激活当前版本
    await NormModel.updateMany({ modelType: "BIG5", isActive: true }, { $set: { isActive: false } });
    await NormModel.updateMany({ normVersion: NORM_VERSION }, { $set: { isActive: true } });
    console.log(`✓ 已激活版本：${NORM_VERSION}`);
  } else {
    console.log(`\n提示：此版本尚未激活。如需设为当前生效版本，重新运行加 --activate 参数。`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("导入失败：", err);
  process.exit(1);
});
