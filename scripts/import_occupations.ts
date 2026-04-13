/**
 * 从 tpl/seed_occupation.json 导入职业常模数据
 *
 * 用法：
 *   ENV=development ts-node scripts/import_occupations.ts
 *   ENV=development ts-node scripts/import_occupations.ts --dry-run
 *   ENV=development ts-node scripts/import_occupations.ts --reset   # 清空后重新导入
 */
import * as fs from "fs";
import * as path from "path";
import * as mongoose from "mongoose";

const SEED_PATH = path.resolve(__dirname, "../tpl/seed_occupation.json");

async function main() {
  const args    = process.argv.slice(2);
  const dryRun  = args.includes("--dry-run");
  const reset   = args.includes("--reset");

  const raw  = fs.readFileSync(SEED_PATH, "utf8");
  const docs = JSON.parse(raw) as Record<string, unknown>[];

  console.log(`\n种子文件：${SEED_PATH}`);
  console.log(`共 ${docs.length} 条职业数据`);

  // 基本字段校验
  const missing = docs.filter((d) => !d["code"] || !d["title"] || d["aiRisk"] === undefined);
  if (missing.length > 0) {
    console.error(`\n❌ 以下条目缺少必要字段（code / title / aiRisk）：`);
    missing.forEach((d) => console.error("  ", d["code"] ?? "(无code)", d["title"] ?? ""));
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n[dry-run] 样本：");
    console.log(JSON.stringify(docs[0], null, 2));
    console.log(`\n[dry-run] 未写入数据库。`);
    return;
  }

  const env        = process.env.ENV ?? "development";
  const configPath = path.resolve(__dirname, `../src/apps/begreat/sysconfig/${env}/db_config.json`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbCfg = (require(configPath) as {
    db_global: { host: string; port: number; db: string; user?: string; password?: string; authSource?: string };
  }).db_global;

  const auth    = dbCfg.user ? `${dbCfg.user}:${dbCfg.password}@` : "";
  const authSrc = dbCfg.authSource ? `?authSource=${dbCfg.authSource}` : "";
  const url     = `mongodb://${auth}${dbCfg.host}:${dbCfg.port}/${dbCfg.db}${authSrc}`;

  console.log(`\n连接 ${dbCfg.host}:${dbCfg.port}/${dbCfg.db} ...`);
  const conn = await mongoose.connect(url);
  console.log("已连接。");

  const OccSchema = new mongoose.Schema({}, { strict: false, collection: "occupationnorms" });
  const OccModel  = conn.model("_ImportOcc", OccSchema);

  const existing = await OccModel.countDocuments();

  if (existing > 0 && !reset) {
    console.log(`\n集合已有 ${existing} 条数据。`);
    console.log("若需覆盖，请加 --reset 参数重新运行。");
    await mongoose.disconnect();
    return;
  }

  if (reset && existing > 0) {
    await OccModel.deleteMany({});
    console.log(`已清空旧数据（${existing} 条）。`);
  }

  await OccModel.insertMany(docs);
  console.log(`✓ 写入 ${docs.length} 条职业常模数据。`);

  // 写入后验证：检查 aiRisk 覆盖率
  const withRisk    = await OccModel.countDocuments({ aiRisk: { $exists: true, $ne: null } });
  const withoutRisk = await OccModel.countDocuments({ $or: [{ aiRisk: { $exists: false } }, { aiRisk: null }] });
  console.log(`\n字段覆盖检查：`);
  console.log(`  含 aiRisk：${withRisk} 条`);
  if (withoutRisk > 0) {
    console.warn(`  ⚠ 缺少 aiRisk：${withoutRisk} 条（AI 冲击分析将无法展示）`);
  } else {
    console.log(`  ✓ 全部含 aiRisk`);
  }

  await mongoose.disconnect();
  console.log("\n完成。");
}

main().catch((err) => {
  console.error("导入失败：", err);
  process.exit(1);
});
