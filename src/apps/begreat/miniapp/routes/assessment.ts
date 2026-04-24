import { Router, Response } from "express";
import { randomBytes } from "crypto";
import { sendSucc, sendErr } from "../../../../shared/miniapp/middleware/response";
import { authMiddleware, type MiniappRequest } from "../../../../shared/miniapp/middleware/auth";
import { getQuestionModel, getSessionModel, getOccupationModel } from "../../dbservice/BegreatDBModel";
import {
  computeAllNormalizedScores,
  buildPersonalityLabel,
  getActiveNormVersion,
  getNormMeta,
} from "../services/CalculationEngine";
import { matchCareersWithDiagnostics } from "../services/MatchingService";
import { buildBegreatReportSnapshot } from "../services/reportTemplate";
import type { Gender, AssessmentType } from "../../entity/session.entity";
import { gameLogger as logger } from "../../../../util/logger";
import {
  BFI2_INSTRUMENT_VERSION,
  bfi2AdjustedScore,
} from "../../bfi2/bfi2ItemMeta";
import type { Big5Dim } from "../../entity/question.entity";
import { resolveInviteCode, creditInviter } from "./invite";

const router = Router();
const BATCH_SIZE = 5;
const VALID_ASSESSMENT_TYPES = new Set<AssessmentType>(["BFI2", "BFI2_FREE", "MBTI", "DISC"]);

const BIG5_DIMS: Big5Dim[] = ["O", "C", "E", "A", "N"];
/** BFI2_FREE: 每个大五维度取 4 题，3 个 facet 均须覆盖（分配：2+1+1） */
const BFI2_FREE_ITEMS_PER_DIM = 4;
/** BFI2_FREE 使用的量表版本标识 */
const BFI2_FREE_INSTRUMENT_VERSION = "BFI2_FREE_CN_20";

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
 * 从 facet 分组中为单个大五维度选出 targetCount 道题，确保所有 facet 至少各出 1 题。
 * 剩余配额随机分配到 facet（加权按剩余题数）。
 */
function selectFromFacets(
  facetMap: Map<string, string[]>,   // facet → questionId[]
  targetCount: number,
): string[] {
  const facets = [...facetMap.keys()];
  if (facets.length === 0) return [];

  // 每个 facet 至少 1 题
  const selected: string[] = [];
  const remaining = new Map<string, string[]>();
  for (const facet of facets) {
    const pool = shuffle(facetMap.get(facet)!);
    if (pool.length === 0) continue;
    selected.push(pool[0]);
    if (pool.length > 1) remaining.set(facet, pool.slice(1));
  }

  // 分配剩余配额
  let quota = targetCount - selected.length;
  const remainingFacets = [...remaining.keys()];
  shuffle(remainingFacets); // 随机化分配顺序
  for (const facet of remainingFacets) {
    if (quota <= 0) break;
    const pool = remaining.get(facet)!;
    selected.push(pool[0]);
    quota--;
  }

  return selected.slice(0, targetCount);
}

/**
 * POST /assessment/start
 * body: { gender: 'male'|'female', age: number }
 * 创建测评 session，打乱题序，返回 sessionId 和总题数
 */
/**
 * GET /assessment/history
 * 返回当前用户所有已完成（completed / paid）的测评记录，按时间倒序
 */
router.get("/history", authMiddleware, async (req: MiniappRequest, res: Response) => {
  try {
    const Sessions = getSessionModel();
    const rawLimit = parseInt(String(req.query.limit ?? "20"), 10);
    const pageLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

    const sessions = await Sessions.find({
      openId: req.userId,
      status: { $in: ["completed", "paid"] },
    })
      .select("sessionId assessmentType status result.personalityLabel result.freeSummary createdAt -_id")
      .sort({ createdAt: -1 })
      .limit(pageLimit)
      .lean()
      .exec();

    const history = sessions.map((s) => ({
      sessionId:        s.sessionId,
      assessmentType:   s.assessmentType ?? "BFI2",
      status:           s.status,
      personalityLabel: s.result?.personalityLabel ?? "",
      freeSummary:      s.result?.freeSummary ?? "",
      createdAt:        s.createdAt,
    }));

    sendSucc(res, { history });
  } catch (err) {
    logger.error("[assessment/history]", err);
    sendErr(res, "Internal error", 500);
  }
});

router.post("/start", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const openId = req.userId!;
  const { gender, age, assessmentType: rawType } = req.body ?? {};
  const assessmentType: AssessmentType = VALID_ASSESSMENT_TYPES.has(rawType) ? rawType : "BFI2";

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
    // ── 每日测评次数限制 ──────────────────────────────────────────────
    const DAILY_LIMITS: Record<AssessmentType, number> = {
      BFI2_FREE: 3,
      BFI2:      2,
      MBTI:      2,
      DISC:      2,
    };
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const Sessions = getSessionModel();
    const todayCount = await Sessions.countDocuments({
      openId,
      assessmentType,
      createdAt: { $gte: todayStart },
    });
    const isDev = (process.env.environment ?? "development") === "development";
    if (!isDev && todayCount >= DAILY_LIMITS[assessmentType]) {
      const typeLabel = assessmentType === "BFI2_FREE" ? "免费版" : "完整版";
      sendErr(res, `今日${typeLabel}测评次数已达上限，请明天再来`, 429);
      return;
    }
    // ─────────────────────────────────────────────────────────────────

    const Questions = getQuestionModel();
    const activeNormVersion = await getActiveNormVersion("BIG5");
    if (!activeNormVersion) {
      sendErr(res, "No active norm version found. Please import norms first.", 500);
      return;
    }

    let selectedIds: string[];
    let instrumentVersion: string;

    if (assessmentType === "BFI2_FREE") {
      // ── BFI2_FREE：每维度选 4 题，覆盖全部 3 个 facet ──────────────
      const allWithMeta = await Questions.find({
          isActive: true,
          modelType: "BIG5",
          $or: [{ gender: gender as Gender }, { gender: "both" }],
          bfiFacet: { $exists: true, $ne: null },
        })
        .select("questionId dimension bfiFacet -_id")
        .lean()
        .exec();

      if (allWithMeta.length === 0) {
        sendErr(res, "Question bank is empty", 500);
        return;
      }

      // 按维度 → facet 分组
      const dimFacetMap = new Map<string, Map<string, string[]>>();
      for (const dim of BIG5_DIMS) dimFacetMap.set(dim, new Map());

      for (const q of allWithMeta) {
        const dim = q.dimension as Big5Dim;
        if (!BIG5_DIMS.includes(dim)) continue;
        const facet = q.bfiFacet!;
        const facetMap = dimFacetMap.get(dim)!;
        if (!facetMap.has(facet)) facetMap.set(facet, []);
        facetMap.get(facet)!.push(q.questionId);
      }

      // 校验每个维度至少有 3 个 facet 各 1 题
      for (const dim of BIG5_DIMS) {
        const facetMap = dimFacetMap.get(dim)!;
        if (facetMap.size < 3) {
          sendErr(res, `Dimension ${dim} has fewer than 3 facets in question bank`, 500);
          return;
        }
      }

      // 每维度按 2+1+1 策略选 4 题
      const perDimIds: string[] = [];
      for (const dim of BIG5_DIMS) {
        const picked = selectFromFacets(dimFacetMap.get(dim)!, BFI2_FREE_ITEMS_PER_DIM);
        perDimIds.push(...picked);
      }

      selectedIds = shuffle(perDimIds);
      instrumentVersion = BFI2_FREE_INSTRUMENT_VERSION;
    } else {
      // ── BFI2（完整版）：全量题目打乱 ────────────────────────────────
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
      selectedIds = shuffle(all.map((q) => q.questionId));
      instrumentVersion = BFI2_INSTRUMENT_VERSION;
    }

    const sessionId = randomBytes(16).toString("hex");
    await Sessions.create({
      sessionId,
      openId,
      assessmentType,
      status: "in_progress",
      userProfile: { gender: gender as Gender, age: ageNum },
      instrumentVersion,
      normVersion: activeNormVersion,
      questionIds: selectedIds,
      answers: [],
    });

    const totalBatches = Math.ceil(selectedIds.length / BATCH_SIZE);
    sendSucc(res, { sessionId, totalQuestions: selectedIds.length, totalBatches });
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

    const isFreeVersion = session.assessmentType === "BFI2_FREE";
    // 完整版：每维度固定 12 题；免费版：每维度 BFI2_FREE_ITEMS_PER_DIM 题
    const expectedPerDomain = isFreeVersion ? BFI2_FREE_ITEMS_PER_DIM : 12;

    const rawBig5Mean: Record<string, number> = {};
    const big5DomainSum: Record<string, number> = {};
    for (const dim of BIG5_DIMS) {
      const cnt = domainAdjCount[dim] ?? 0;
      const sum = domainAdjSum[dim] ?? 0;
      if (cnt !== expectedPerDomain) {
        logger.error(`[assessment/complete] ${session.assessmentType} domain ${dim} item count ${cnt}, expected ${expectedPerDomain}`);
        sendErr(res, "Assessment data inconsistent (BFI-2)", 500);
        return;
      }
      rawBig5Mean[dim] = parseFloat((sum / cnt).toFixed(4));
      big5DomainSum[dim] = parseFloat(sum.toFixed(4));
    }

    // 子维度均分：完整版严格校验 4 题/facet；免费版宽松（允许 1-2 题/facet）
    const bfi2FacetMeans: Record<string, number> = {};
    for (const [facet, cnt] of Object.entries(facetAdjCount)) {
      if (!isFreeVersion && cnt !== 4) {
        logger.error(`[assessment/complete] BFI-2 facet ${facet} count ${cnt}, expected 4`);
        sendErr(res, "Assessment data inconsistent (BFI-2 facets)", 500);
        return;
      }
      if (cnt > 0) {
        bfi2FacetMeans[facet] = parseFloat(((facetAdjSum[facet] ?? 0) / cnt).toFixed(4));
      }
    }

    const { gender, age } = session.userProfile;
    const normVersion = session.normVersion!;
    const big5Norm = await computeAllNormalizedScores(rawBig5Mean, gender, age, normVersion);

    // 职业匹配（含诊断信息：硬排除、软降权）
    const Occupations = getOccupationModel();
    const occupations = await Occupations.find({ isActive: true }).lean().exec();
    const { topCareers, hardExcluded, softAdjusted } = matchCareersWithDiagnostics(
      { big5Norm, age },
      occupations,
      10,
    );

    // 性格标签
    const { label, summary } = buildPersonalityLabel(big5Norm);

    const report = buildBegreatReportSnapshot({
      gender,
      age,
      big5Z: big5Norm,
      personalitySummary: summary,
      topCareers,
    });

    // 常模元信息快照
    const normMeta = await getNormMeta(normVersion);

    // 免费版在 freeSummary 中注明为快速版
    const versionNote = isFreeVersion ? "\n\n（基于20题快速版，精度低于60题完整版）" : "";
    const freeSummary = `${report.coverLine}\n\n${report.summaryLine}${versionNote}`;

    session.result = {
      big5Scores:    rawBig5Mean,
      big5DomainSum,
      bfi2FacetMeans,
      big5Normalized: big5Norm,
      topCareers,
      hardExcluded,
      softAdjusted,
      freeSummary,
      personalityLabel: label,
      report,
      instrumentVersion: session.instrumentVersion ?? BFI2_INSTRUMENT_VERSION,
      normVersion,
      normSource:        normMeta?.source ?? null,
      normSampleSize:    normMeta?.sampleSize ?? null,
    };
    session.status = "completed";
    await session.save();

    sendSucc(res, { personalityLabel: label, freeSummary, sessionId, report });
  } catch (err) {
    logger.error("[assessment/complete]", err);
    sendErr(res, "Internal error", 500);
  }
});

export default router;
