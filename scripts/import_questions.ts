/**
 * 从 Excel 导入题库
 *
 * 用法：
 *   ENV=development ts-node scripts/import_questions.ts ./questions.xlsx
 *   ENV=development ts-node scripts/import_questions.ts ./questions.xlsx --dry-run
 *
 * Excel 格式（第一行为表头，列顺序不限）：
 *   content    题目内容（必填）
 *   modelType  RIASEC 或 BIG5（必填）
 *   dimension  R/I/A/S/E/C（RIASEC）或 O/C/E/A/N（BIG5）（必填）
 *   weight     计分权重，默认 1.0
 *   gender     male / female / both，默认 both
 *   ageMin     最小年龄（含），默认 0
 *   ageMax     最大年龄（含），默认 999
 *   isActive   TRUE / FALSE，默认 TRUE
 */

import * as path from "path";
import * as fs from "fs";
import { randomBytes } from "crypto";
import * as XLSX from "xlsx";
import * as mongoose from "mongoose";

// ── 类型 ────────────────────────────────────────────────────────────────────

type ModelType    = "RIASEC" | "BIG5";
type QuestionGender = "male" | "female" | "both";

interface QuestionRow {
  questionId: string;
  modelType:  ModelType;
  dimension:  string;
  content:    string;
  weight:     number;
  gender:     QuestionGender;
  ageMin:     number;
  ageMax:     number;
  isActive:   boolean;
}

// ── 校验常量 ─────────────────────────────────────────────────────────────────

const VALID_MODEL_TYPES  = new Set(["RIASEC", "BIG5"]);
const VALID_RIASEC_DIMS  = new Set(["R", "I", "A", "S", "E", "C"]);
const VALID_BIG5_DIMS    = new Set(["O", "C", "E", "A", "N"]);
const VALID_GENDERS      = new Set(["male", "female", "both"]);

// ── Excel 解析 ───────────────────────────────────────────────────────────────

function parseExcel(filePath: string): QuestionRow[] {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const questions: QuestionRow[] = [];
  const errors: string[] = [];

  rows.forEach((row, i) => {
    const line = i + 2; // Excel 行号（1 = 表头）

    const content   = String(row["content"]   ?? "").trim();
    const modelType = String(row["modelType"] ?? "").trim().toUpperCase() as ModelType;
    const dimension = String(row["dimension"] ?? "").trim().toUpperCase();
    const weightRaw = row["weight"];
    const genderRaw = String(row["gender"]    ?? "both").trim().toLowerCase();
    const ageMinRaw = row["ageMin"];
    const ageMaxRaw = row["ageMax"];
    const activeRaw = row["isActive"];

    // 必填校验
    if (!content)                          { errors.push(`第 ${line} 行：content 为空`); return; }
    if (!VALID_MODEL_TYPES.has(modelType)) { errors.push(`第 ${line} 行：modelType 无效（${row["modelType"]}）`); return; }

    const validDims = modelType === "RIASEC" ? VALID_RIASEC_DIMS : VALID_BIG5_DIMS;
    if (!validDims.has(dimension))         { errors.push(`第 ${line} 行：dimension 无效（${row["dimension"]}）`); return; }

    // 可选字段
    const weight = weightRaw !== "" && weightRaw != null ? Number(weightRaw) : 1.0;
    if (isNaN(weight) || weight <= 0)      { errors.push(`第 ${line} 行：weight 无效（${weightRaw}）`); return; }

    const gender = VALID_GENDERS.has(genderRaw) ? genderRaw as QuestionGender : "both";

    const ageMin = ageMinRaw !== "" && ageMinRaw != null ? Number(ageMinRaw) : 0;
    const ageMax = ageMaxRaw !== "" && ageMaxRaw != null ? Number(ageMaxRaw) : 999;
    if (isNaN(ageMin) || isNaN(ageMax) || ageMin > ageMax) {
      errors.push(`第 ${line} 行：ageMin/ageMax 无效（${ageMinRaw}/${ageMaxRaw}）`); return;
    }

    const isActiveStr = String(activeRaw ?? "true").trim().toLowerCase();
    const isActive = isActiveStr !== "false" && isActiveStr !== "0" && isActiveStr !== "FALSE";

    questions.push({
      questionId: randomBytes(8).toString("hex"),
      modelType,
      dimension,
      content,
      weight,
      gender,
      ageMin,
      ageMax,
      isActive,
    });
  });

  if (errors.length > 0) {
    console.error("\n校验失败：");
    errors.forEach((e) => console.error(" ", e));
    process.exit(1);
  }

  return questions;
}

// ── 统计摘要 ─────────────────────────────────────────────────────────────────

function printSummary(questions: QuestionRow[]) {
  const byDim: Record<string, number> = {};
  for (const q of questions) {
    const key = `${q.modelType}-${q.dimension}`;
    byDim[key] = (byDim[key] ?? 0) + 1;
  }
  console.log(`\n共解析 ${questions.length} 题：`);
  for (const [key, count] of Object.entries(byDim).sort()) {
    console.log(`  ${key}: ${count} 题`);
  }
  const inactive = questions.filter((q) => !q.isActive).length;
  if (inactive > 0) console.log(`  （其中 ${inactive} 题 isActive=false）`);
}

// ── 主流程 ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error("用法：ts-node scripts/import_questions.ts <file.xlsx> [--dry-run]");
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`文件不存在：${absPath}`);
    process.exit(1);
  }

  console.log(`读取文件：${absPath}`);
  const questions = parseExcel(absPath);
  printSummary(questions);

  if (dryRun) {
    console.log("\n[dry-run] 未写入数据库。");
    return;
  }

  // 连接数据库
  const env = process.env.ENV ?? process.env.environment ?? "development";
  const configPath = path.resolve(__dirname, `../src/apps/begreat/sysconfig/${env}/db_config.json`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbCfg = (require(configPath) as { db_global: { host: string; port: number; db: string; user?: string; password?: string; authSource?: string } }).db_global;

  const auth    = dbCfg.user ? `${dbCfg.user}:${dbCfg.password}@` : "";
  const authSrc = dbCfg.authSource ? `?authSource=${dbCfg.authSource}` : "";
  const url     = `mongodb://${auth}${dbCfg.host}:${dbCfg.port}/${dbCfg.db}${authSrc}`;

  console.log(`\n连接数据库 ${dbCfg.host}:${dbCfg.port}/${dbCfg.db} ...`);
  const conn = await mongoose.connect(url);
  console.log("已连接。");

  const QuestionSchema = new mongoose.Schema({}, { strict: false, collection: "questions" });
  const QuestionModel = conn.model("_ImportQuestion", QuestionSchema);

  // 清空旧数据后全量插入
  const existing = await QuestionModel.countDocuments();
  if (existing > 0) {
    process.stdout.write(`数据库中已有 ${existing} 题，清空并替换？(y/N) `);
    const answer = await new Promise<string>((resolve) => {
      process.stdin.once("data", (d) => resolve(d.toString().trim()));
    });
    if (answer.toLowerCase() !== "y") {
      console.log("已取消。");
      await mongoose.disconnect();
      return;
    }
    await QuestionModel.deleteMany({});
  }

  await QuestionModel.insertMany(questions);
  console.log(`✓ 成功导入 ${questions.length} 题。`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("导入失败：", err);
  process.exit(1);
});
