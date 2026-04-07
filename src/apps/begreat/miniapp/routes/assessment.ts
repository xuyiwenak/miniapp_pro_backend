import { Router, Response } from "express";
import { randomBytes } from "crypto";
import { sendSucc, sendErr } from "../../../../shared/miniapp/middleware/response";
import { authMiddleware, type MiniappRequest } from "../../../../shared/miniapp/middleware/auth";
import { getQuestionModel, getSessionModel, getOccupationModel } from "../../dbservice/BegreatDBModel";
import {
  computeAllNormalizedScores,
  topDimensions,
  buildPersonalityLabel,
} from "../services/CalculationEngine";
import { matchCareers } from "../services/MatchingService";
import type { Gender } from "../../entity/session.entity";
import { gameLogger as logger } from "../../../../util/logger";

const router = Router();
const BATCH_SIZE = 5;

/** 随机打乱数组（Fisher-Yates） */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * POST /assessment/start
 * body: { gender: 'male'|'female', age: number }
 * 创建测评 session，打乱题序，返回 sessionId 和总题数
 */
router.post("/start", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const openId = req.userId!;
  const { gender, age } = req.body ?? {};

  if (!gender || !["male", "female"].includes(gender)) {
    sendErr(res, "Invalid gender", 400);
    return;
  }
  const ageNum = Number(age);
  if (!ageNum || ageNum < 15 || ageNum > 80) {
    sendErr(res, "Invalid age", 400);
    return;
  }

  try {
    const Questions = getQuestionModel();
    const all = await Questions.find({ isActive: true }).select("questionId").lean().exec();
    if (all.length === 0) {
      sendErr(res, "Question bank is empty", 500);
      return;
    }

    const shuffled = shuffle(all.map((q) => q.questionId));
    const sessionId = randomBytes(16).toString("hex");

    const Sessions = getSessionModel();
    await Sessions.create({
      sessionId,
      openId,
      status: "in_progress",
      userProfile: { gender: gender as Gender, age: ageNum },
      questionIds: shuffled,
      answers: [],
    });

    const totalBatches = Math.ceil(shuffled.length / BATCH_SIZE);
    sendSucc(res, { sessionId, totalQuestions: shuffled.length, totalBatches });
  } catch (err) {
    logger.error("[assessment/start]", err);
    sendErr(res, "Internal error", 500);
  }
});

/**
 * GET /assessment/batch/:sessionId/:batchIndex
 * 返回第 batchIndex 批题目（5题），不含 dimension/modelType（防刷题）
 */
router.get("/batch/:sessionId/:batchIndex", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const { sessionId, batchIndex } = req.params;
  const batchIdx = parseInt(batchIndex, 10);

  if (isNaN(batchIdx) || batchIdx < 0) {
    sendErr(res, "Invalid batchIndex", 400);
    return;
  }

  try {
    const Sessions = getSessionModel();
    const session = await Sessions.findOne({ sessionId, openId: req.userId }).lean().exec();
    if (!session) { sendErr(res, "Session not found", 404); return; }
    if (session.status !== "in_progress") { sendErr(res, "Session already completed", 400); return; }

    const start = batchIdx * BATCH_SIZE;
    const batchIds = session.questionIds.slice(start, start + BATCH_SIZE);
    if (batchIds.length === 0) { sendErr(res, "No more batches", 400); return; }

    const Questions = getQuestionModel();
    const questions = await Questions.find({ questionId: { $in: batchIds } })
      .select("questionId content weight -_id")
      .lean()
      .exec();

    // 按 session 题序排列（不透露 dimension 给前端）
    const ordered = batchIds.map((id) => questions.find((q) => q.questionId === id)).filter(Boolean);

    const alreadyAnswered = session.answers.length;
    const totalBatches = Math.ceil(session.questionIds.length / BATCH_SIZE);

    sendSucc(res, {
      batchIndex: batchIdx,
      questions: ordered,
      answeredCount: alreadyAnswered,
      totalQuestions: session.questionIds.length,
      totalBatches,
      isLastBatch: batchIdx === totalBatches - 1,
    });
  } catch (err) {
    logger.error("[assessment/batch]", err);
    sendErr(res, "Internal error", 500);
  }
});

/**
 * POST /assessment/batch/:sessionId/:batchIndex
 * body: { answers: [{ questionId, score }] }
 * 提交当前批次答案
 */
router.post("/batch/:sessionId/:batchIndex", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const { sessionId } = req.params;
  const { answers } = req.body ?? {};

  if (!Array.isArray(answers) || answers.length === 0) {
    sendErr(res, "Missing answers", 400);
    return;
  }
  for (const a of answers) {
    if (!a.questionId || typeof a.score !== "number" || a.score < 1 || a.score > 5) {
      sendErr(res, "Invalid answer format", 400);
      return;
    }
  }

  try {
    const Sessions = getSessionModel();
    const session = await Sessions.findOne({ sessionId, openId: req.userId }).exec();
    if (!session) { sendErr(res, "Session not found", 404); return; }
    if (session.status !== "in_progress") { sendErr(res, "Session already completed", 400); return; }

    // 仅接受本 session 题库中的题目
    const validIds = new Set(session.questionIds);
    const valid = answers.filter((a: { questionId: string }) => validIds.has(a.questionId));
    session.answers.push(...valid);
    await session.save();

    sendSucc(res, { savedCount: valid.length, totalAnswered: session.answers.length });
  } catch (err) {
    logger.error("[assessment/submit-batch]", err);
    sendErr(res, "Internal error", 500);
  }
});

/**
 * POST /assessment/complete/:sessionId
 * 完成测评：计算得分、生成报告、存储结果
 */
router.post("/complete/:sessionId", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const { sessionId } = req.params;

  try {
    const Sessions = getSessionModel();
    const session = await Sessions.findOne({ sessionId, openId: req.userId }).exec();
    if (!session) { sendErr(res, "Session not found", 404); return; }
    if (session.status !== "in_progress") { sendErr(res, "Session already completed", 400); return; }

    if (session.answers.length < session.questionIds.length) {
      sendErr(res, `Incomplete: ${session.answers.length}/${session.questionIds.length} answered`, 400);
      return;
    }

    // 获取所有已答题目的维度信息
    const Questions = getQuestionModel();
    const questionDims = await Questions.find({ questionId: { $in: session.questionIds } })
      .select("questionId modelType dimension weight -_id")
      .lean()
      .exec();

    const dimMap = new Map(questionDims.map((q) => [q.questionId, q]));

    // 汇总原始分
    const rawRiasec: Record<string, number> = {};
    const rawBig5: Record<string, number> = {};

    for (const ans of session.answers) {
      const q = dimMap.get(ans.questionId);
      if (!q) continue;
      const score = ans.score * (q.weight ?? 1);
      if (q.modelType === "RIASEC") {
        rawRiasec[q.dimension] = (rawRiasec[q.dimension] ?? 0) + score;
      } else {
        rawBig5[q.dimension] = (rawBig5[q.dimension] ?? 0) + score;
      }
    }

    const { gender, age } = session.userProfile;
    const { riasecNorm, big5Norm } = computeAllNormalizedScores(rawRiasec, rawBig5, gender, age);

    // 职业匹配
    const Occupations = getOccupationModel();
    const occupations = await Occupations.find({ isActive: true }).lean().exec();
    const topCareers = matchCareers({ riasecNorm, big5Norm, age }, occupations);

    // 性格标签
    const topRiasec = topDimensions(riasecNorm, 2);
    const { label, summary } = buildPersonalityLabel(topRiasec);

    session.result = {
      riasecScores:     rawRiasec,
      big5Scores:       rawBig5,
      riasecNormalized: riasecNorm,
      big5Normalized:   big5Norm,
      topCareers,
      freeSummary:      summary,
      personalityLabel: label,
    };
    session.status = "completed";
    await session.save();

    sendSucc(res, { personalityLabel: label, freeSummary: summary, sessionId });
  } catch (err) {
    logger.error("[assessment/complete]", err);
    sendErr(res, "Internal error", 500);
  }
});

export default router;
