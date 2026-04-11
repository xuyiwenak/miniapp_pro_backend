import { Router, Response } from "express";
import { randomBytes } from "crypto";
import { sendSucc, sendErr } from "../../../../shared/miniapp/middleware/response";
import { authMiddleware, type MiniappRequest } from "../../../../shared/miniapp/middleware/auth";
import { getQuestionModel, getSessionModel, getOccupationModel } from "../../dbservice/BegreatDBModel";
import {
  computeAllNormalizedScores,
  topDimensions,
  buildPersonalityLabel,
  getActiveNormVersion,
  getNormMeta,
} from "../services/CalculationEngine";
import { matchCareers } from "../services/MatchingService";
import type { Gender } from "../../entity/session.entity";
import { gameLogger as logger } from "../../../../util/logger";
import {
  BFI2_INSTRUMENT_VERSION,
  bfi2AdjustedScore,
} from "../../bfi2/bfi2ItemMeta";
import type { Big5Dim } from "../../entity/question.entity";

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
    const all = await Questions.find({
        isActive: true,
        $or: [{ gender: gender as Gender }, { gender: "both" }],
      })
      .select("questionId")
      .lean()
      .exec();
    if (all.length === 0) {
      sendErr(res, "Question bank is empty", 500);
      return;
    }

    const shuffled = shuffle(all.map((q) => q.questionId));
    const sessionId = randomBytes(16).toString("hex");

    // 获取当前激活常模版本，快照到 session 保证报告稳定
    const activeNormVersion = await getActiveNormVersion("BIG5");
    if (!activeNormVersion) {
      sendErr(res, "No active norm version found. Please import norms first.", 500);
      return;
    }

    const Sessions = getSessionModel();
    await Sessions.create({
      sessionId,
      openId,
      status: "in_progress",
      userProfile: { gender: gender as Gender, age: ageNum },
      instrumentVersion: BFI2_INSTRUMENT_VERSION,
      normVersion: activeNormVersion,
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
      .select("questionId content -_id")
      .lean()
      .exec();

    // 按 session 题序排列，只返回 index + content，不暴露 questionId/dimension
    const globalStart = batchIdx * BATCH_SIZE;
    const ordered = batchIds
      .map((id, i) => {
        const q = questions.find((q) => q.questionId === id);
        return q ? { index: globalStart + i, content: q.content } : null;
      })
      .filter(Boolean);

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
    if (typeof a.index !== "number" || typeof a.score !== "number" || a.score < 1 || a.score > 5) {
      sendErr(res, "Invalid answer format", 400);
      return;
    }
  }

  try {
    const Sessions = getSessionModel();
    const session = await Sessions.findOne({ sessionId, openId: req.userId }).exec();
    if (!session) { sendErr(res, "Session not found", 404); return; }
    if (session.status !== "in_progress") { sendErr(res, "Session already completed", 400); return; }

    // 仅接受合法 index 范围内的答案
    const total = session.questionIds.length;
    const valid = answers.filter((a: { index: number }) => a.index >= 0 && a.index < total);
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

    const answerByIndex = new Map<number, number>();
    for (const a of session.answers) answerByIndex.set(a.index, a.score);
    if (answerByIndex.size !== session.questionIds.length) {
      sendErr(res, `Incomplete or invalid: ${answerByIndex.size}/${session.questionIds.length} unique answers`, 400);
      return;
    }

    // 获取所有已答题目的维度信息
    const Questions = getQuestionModel();
    const questionDims = await Questions.find({ questionId: { $in: session.questionIds } })
      .select("questionId modelType dimension weight bfiItemNo bfiReverse bfiFacet -_id")
      .lean()
      .exec();

    const dimMap = new Map(questionDims.map((q) => [q.questionId, q]));

    const rawRiasec: Record<string, number> = {};
    const domainAdjSum: Partial<Record<Big5Dim, number>> = {};
    const domainAdjCount: Partial<Record<Big5Dim, number>> = {};
    const facetAdjSum: Record<string, number> = {};
    const facetAdjCount: Record<string, number> = {};

    const sortedAnswers = [...answerByIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, score]) => ({ index, score }));

    for (const ans of sortedAnswers) {
      if (ans.index < 0 || ans.index >= session.questionIds.length) continue;
      const qid = session.questionIds[ans.index];
      const q = qid ? dimMap.get(qid) : undefined;
      if (!q) continue;
      if (q.modelType === "RIASEC") {
        const score = ans.score * (q.weight ?? 1);
        rawRiasec[q.dimension] = (rawRiasec[q.dimension] ?? 0) + score;
        continue;
      }
      if (q.modelType === "BIG5" && typeof q.bfiItemNo === "number") {
        const adj = bfi2AdjustedScore(ans.score, q.bfiItemNo);
        const dim = q.dimension as Big5Dim;
        domainAdjSum[dim] = (domainAdjSum[dim] ?? 0) + adj;
        domainAdjCount[dim] = (domainAdjCount[dim] ?? 0) + 1;
        if (q.bfiFacet) {
          facetAdjSum[q.bfiFacet] = (facetAdjSum[q.bfiFacet] ?? 0) + adj;
          facetAdjCount[q.bfiFacet] = (facetAdjCount[q.bfiFacet] ?? 0) + 1;
        }
      }
    }

    const big5Dims: Big5Dim[] = ["O", "C", "E", "A", "N"];
    const rawBig5Mean: Record<string, number> = {};
    const big5DomainSum: Record<string, number> = {};
    for (const dim of big5Dims) {
      const cnt = domainAdjCount[dim] ?? 0;
      const sum = domainAdjSum[dim] ?? 0;
      if (cnt !== 12) {
        logger.error(`[assessment/complete] BFI-2 domain ${dim} item count ${cnt}, expected 12`);
        sendErr(res, "Assessment data inconsistent (BFI-2)", 500);
        return;
      }
      rawBig5Mean[dim] = parseFloat((sum / 12).toFixed(4));
      big5DomainSum[dim] = parseFloat(sum.toFixed(4));
    }

    const bfi2FacetMeans: Record<string, number> = {};
    for (const [facet, cnt] of Object.entries(facetAdjCount)) {
      if (cnt !== 4) {
        logger.error(`[assessment/complete] BFI-2 facet ${facet} count ${cnt}, expected 4`);
        sendErr(res, "Assessment data inconsistent (BFI-2 facets)", 500);
        return;
      }
      bfi2FacetMeans[facet] = parseFloat(((facetAdjSum[facet] ?? 0) / 4).toFixed(4));
    }

    const { gender, age } = session.userProfile;
    const normVersion = session.normVersion!;
    const { riasecNorm, big5Norm } = await computeAllNormalizedScores(rawRiasec, rawBig5Mean, gender, age, normVersion);

    // 职业匹配
    const Occupations = getOccupationModel();
    const occupations = await Occupations.find({ isActive: true }).lean().exec();
    const topCareers = matchCareers({ riasecNorm, big5Norm, age }, occupations);

    // 性格标签
    const topRiasec = topDimensions(riasecNorm, 2);
    const { label, summary } = buildPersonalityLabel(topRiasec);

    // 常模元信息快照（写进 result，报告可展示来源）
    const normMeta = await getNormMeta(normVersion);

    session.result = {
      riasecScores:     rawRiasec,
      big5Scores:       rawBig5Mean,
      big5DomainSum,
      bfi2FacetMeans,
      riasecNormalized: riasecNorm,
      big5Normalized:   big5Norm,
      topCareers,
      freeSummary:      summary,
      personalityLabel: label,
      instrumentVersion: session.instrumentVersion ?? BFI2_INSTRUMENT_VERSION,
      normVersion,
      normSource:        normMeta?.source ?? null,
      normSampleSize:    normMeta?.sampleSize ?? null,
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
