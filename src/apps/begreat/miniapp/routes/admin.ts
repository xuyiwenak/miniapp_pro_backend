/**
 * 题库管理接口（需要 internal_server_token 鉴权）
 *
 * GET  /admin/questions/export  — 导出当前题库为 Excel
 * POST /admin/questions/import  — 上传 Excel 替换题库
 *
 * Header:  Authorization: Bearer <internal_server_token>
 */
import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";
import multer from "multer";
import * as XLSX from "xlsx";
import { ComponentManager, EComName } from "../../../../common/BaseComponent";
import { getQuestionModel, getOccupationModel } from "../../dbservice/BegreatDBModel";
import { gameLogger as logger } from "../../../../util/logger";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── 鉴权中间件 ────────────────────────────────────────────────────────────────

function adminAuth(req: Request, res: Response, next: () => void) {
  const sysCfg = ComponentManager.instance.getComponent(EComName.SysCfgComponent);
  const cfg = sysCfg.server_auth_config as { internal_server_token?: string };
  const expected = cfg?.internal_server_token;

  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || token !== expected) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  next();
}

// ── 导出 ──────────────────────────────────────────────────────────────────────

router.get("/questions/export", adminAuth, async (_req: Request, res: Response) => {
  try {
    const Questions = getQuestionModel();
    const all = await Questions.find({})
      .select("modelType dimension content weight gender ageMin ageMax isActive -_id")
      .lean()
      .exec();

    const headers = ["content", "modelType", "dimension", "weight", "gender", "ageMin", "ageMax", "isActive"];
    const rows = all.map((q) => [
      q.content,
      q.modelType,
      q.dimension,
      q.weight ?? 1.0,
      (q as any).gender ?? "male",
      (q as any).ageMin ?? 0,
      (q as any).ageMax ?? 999,
      q.isActive ? "TRUE" : "FALSE",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 55 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "题库");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="questions_${Date.now()}.xlsx"`);
    res.send(buf);
    logger.info(`[admin] exported ${all.length} questions`);
  } catch (err) {
    logger.error("[admin/export]", err);
    res.status(500).json({ success: false, message: "Export failed" });
  }
});

// ── 导入 ──────────────────────────────────────────────────────────────────────

const VALID_MODEL = new Set(["BIG5"]);
const VALID_BIG5  = new Set(["O", "C", "E", "A", "N"]);
const VALID_GENDER = new Set(["male", "female"]);

router.post("/questions/import", adminAuth, upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: "No file uploaded" });
    return;
  }

  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    const questions: object[] = [];
    const errors: string[] = [];

    rows.forEach((row, i) => {
      const line = i + 2;
      const content    = String(row["content"]   ?? "").trim();
      const modelType  = String(row["modelType"] ?? "").trim().toUpperCase();
      const dimension  = String(row["dimension"] ?? "").trim().toUpperCase();
      const weightRaw  = row["weight"];
      const genderRaw  = String(row["gender"]    ?? "both").trim().toLowerCase();
      const ageMinRaw  = row["ageMin"];
      const ageMaxRaw  = row["ageMax"];
      const activeRaw  = row["isActive"];

      if (!content)                          { errors.push(`第${line}行: content 为空`); return; }
      if (!VALID_MODEL.has(modelType))       { errors.push(`第${line}行: modelType 无效(${row["modelType"]})`); return; }
      const validDims = VALID_BIG5;
      if (!validDims.has(dimension))         { errors.push(`第${line}行: dimension 无效(${row["dimension"]})`); return; }

      const weight = weightRaw !== "" && weightRaw != null ? Number(weightRaw) : 1.0;
      if (isNaN(weight) || weight <= 0)      { errors.push(`第${line}行: weight 无效`); return; }

      if (!VALID_GENDER.has(genderRaw)) { errors.push(`第${line}行: gender 必须为 male 或 female`); return; }
      const gender = genderRaw;
      const ageMin = ageMinRaw !== "" && ageMinRaw != null ? Number(ageMinRaw) : 0;
      const ageMax = ageMaxRaw !== "" && ageMaxRaw != null ? Number(ageMaxRaw) : 999;
      if (isNaN(ageMin) || isNaN(ageMax) || ageMin > ageMax) {
        errors.push(`第${line}行: ageMin/ageMax 无效`); return;
      }
      const activeStr = String(activeRaw ?? "true").trim().toLowerCase();
      const isActive = activeStr !== "false" && activeStr !== "0";

      questions.push({
        questionId: randomBytes(8).toString("hex"),
        modelType, dimension, content, weight, gender, ageMin, ageMax, isActive,
      });
    });

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: "校验失败", errors });
      return;
    }

    const Questions = getQuestionModel();
    await Questions.deleteMany({});
    await Questions.insertMany(questions);

    logger.info(`[admin] imported ${questions.length} questions`);
    res.json({ success: true, message: `成功导入 ${questions.length} 题` });
  } catch (err) {
    logger.error("[admin/import]", err);
    res.status(500).json({ success: false, message: "Import failed" });
  }
});

// ── 职业种子数据导入 ──────────────────────────────────────────────────────────
//
// POST /admin/occupations/seed
// 读取 tpl/seed_occupation.json，按 code 做 upsert（已存在则更新，不存在则新增）
// 支持 ?reset=true 先清空再写入（谨慎使用）

router.post("/occupations/seed", adminAuth, async (req: Request, res: Response) => {
  const seedPath = path.resolve(__dirname, "../../../../../../tpl/seed_occupation.json");

  if (!fs.existsSync(seedPath)) {
    res.status(404).json({ success: false, message: "seed_occupation.json 不存在" });
    return;
  }

  let records: unknown[];
  try {
    records = JSON.parse(fs.readFileSync(seedPath, "utf8"));
    if (!Array.isArray(records)) throw new Error("根节点必须是数组");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ success: false, message: `seed 文件解析失败: ${msg}` });
    return;
  }

  try {
    const Occupations = getOccupationModel();
    const reset = String(req.query["reset"]).toLowerCase() === "true";
    if (reset) {
      await Occupations.deleteMany({});
      logger.info("[admin/occupations/seed] cleared all occupations before seed");
    }

    let upserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const raw = records[i] as Record<string, unknown>;
      if (!raw["code"] || !raw["title"]) {
        errors.push(`第 ${i + 1} 条：缺少 code 或 title`);
        continue;
      }
      await Occupations.updateOne(
        { code: raw["code"] },
        { $set: raw },
        { upsert: true }
      );
      upserted++;
    }

    logger.info(`[admin/occupations/seed] upserted ${upserted} occupations`);
    res.json({ success: true, upserted, errors });
  } catch (err) {
    logger.error("[admin/occupations/seed]", err);
    res.status(500).json({ success: false, message: "导入失败" });
  }
});

// GET /admin/occupations/seed — 预览 seed 文件（不写库，方便校验）
router.get("/occupations/seed", adminAuth, async (_req: Request, res: Response) => {
  const seedPath = path.resolve(__dirname, "../../../../../../tpl/seed_occupation.json");
  if (!fs.existsSync(seedPath)) {
    res.status(404).json({ success: false, message: "seed_occupation.json 不存在" });
    return;
  }
  try {
    const raw = fs.readFileSync(seedPath, "utf8");
    const records = JSON.parse(raw) as unknown[];
    res.json({ success: true, count: records.length, records });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ success: false, message: `解析失败: ${msg}` });
  }
});

export default router;
