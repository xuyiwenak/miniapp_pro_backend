import { Router, Response } from "express";
import { sendSucc, sendErr } from "../../../../shared/miniapp/middleware/response";
import { authMiddleware, type MiniappRequest } from "../../../../shared/miniapp/middleware/auth";
import { getSessionModel, getPaymentModel } from "../../dbservice/BegreatDBModel";
import { gameLogger as logger } from "../../../../util/logger";
import { loadReportTemplate } from "../services/reportTemplate";
import { ComponentManager, EComName } from "../../../../common/BaseComponent";

const router = Router();

/**
 * GET /report/:sessionId
 *
 * Tier-0 free (completed):          personalityLabel + freeSummary + top3 标题+匹配分+AI风险徽章
 * Tier-1 invite_unlocked:           + Big5图 + 胜任力 + top3 含描述/行业/技能（无薪资/AI建议）
 * Tier-2 paid:                      完整报告
 */
router.get("/:sessionId", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const { sessionId } = req.params;

  try {
    const Sessions = getSessionModel();
    const session = await Sessions.findOne({ sessionId, openId: req.userId }).lean().exec();

    if (!session) { sendErr(res, "Session not found", 404); return; }
    if (!session.result || session.status === "in_progress") {
      sendErr(res, "Assessment not completed yet", 400);
      return;
    }

    const sysCfgComp = ComponentManager.instance.getComponent(EComName.SysCfgComponent);
    const authCfg = (sysCfgComp.server_auth_config ?? {}) as { paymentEnabled?: boolean };
    const paymentEnabled = authCfg.paymentEnabled !== false;

    const isPaid           = paymentEnabled ? session.status === "paid" : true;
    const isInviteUnlocked = !isPaid && session.status === "invite_unlocked";
    const isFreeVersion    = session.assessmentType === "BFI2_FREE";
    const { result } = session;
    const reportPayload = result.report ?? null;
    const tpl   = loadReportTemplate();
    const bands = tpl.careers.ai_impact.risk_bands;
    const allCareers = result.topCareers;
    const highCount = allCareers.filter(
      (c) => c.aiRisk !== undefined && c.aiRisk > bands.medium.max
    ).length;

    // ── BFI2_FREE: 始终返回简洁免费版，与支付状态无关 ──────────────────
    if (isFreeVersion) {
      sendSucc(res, {
        isPaid:           false,
        isInviteUnlocked: false,
        isFreeVersion:    true,
        assessmentType:   session.assessmentType,
        personalityLabel: result.personalityLabel,
        freeSummary:      result.freeSummary,
        topCareers: result.topCareers.slice(0, 3).map((c) => ({
          code:        c.code,
          title:       c.title,
          matchScore:  c.matchScore,
          description: c.description || "",
        })),
      });
      return;
    }

    if (isPaid) {
      // ── Tier-2: 完整报告 ─────────────────────────────────────────────
      sendSucc(res, {
        isPaid: true,
        isInviteUnlocked: false,
        isFreeVersion:    false,
        personalityLabel:   result.personalityLabel,
        freeSummary:        result.freeSummary,
        report:             reportPayload,
        big5Normalized:     result.big5Normalized,
        bfi2FacetMeans:     result.bfi2FacetMeans,
        topCareers:         result.topCareers,
        competencyAnalysis: buildCompetencyAnalysis(result.big5Normalized),
        facetInsights:      buildFacetInsights(result.bfi2FacetMeans ?? {}),
        normMeta: {
          version:    result.normVersion    ?? null,
          source:     result.normSource     ?? null,
          sampleSize: result.normSampleSize ?? null,
        },
      });
    } else if (isInviteUnlocked) {
      // ── Tier-1: 邀请解锁层 ───────────────────────────────────────────
      // 职业：top3，含描述/行业/技能，无薪资/AI建议
      const top3Invite = result.topCareers.slice(0, 3).map((c) => ({
        code:        c.code,
        title:       c.title,
        matchScore:  c.matchScore,
        description: c.description,
        industry:    c.industry,
        level:       c.level,
        skills:      c.skills ? { required: c.skills.required ?? [] } : undefined,
        aiRisk:      buildFreeAiRisk(c.aiRisk, bands),   // 只显示徽章，无建议
        // salary / aiImpactAdvice / ageHints 不返回
      }));

      sendSucc(res, {
        isPaid:           false,
        isInviteUnlocked: true,
        personalityLabel:   result.personalityLabel,
        freeSummary:        result.freeSummary,
        report:             reportPayload,
        big5Normalized:     result.big5Normalized,
        competencyAnalysis: buildCompetencyAnalysis(result.big5Normalized),
        topCareers:         top3Invite,
        aiRiskSummary:      { total: allCareers.length, highCount },
        normMeta: {
          version:    result.normVersion    ?? null,
          source:     result.normSource     ?? null,
          sampleSize: result.normSampleSize ?? null,
        },
      });
    } else {
      // ── Tier-0: BFI2 免费层（未付费、未邀请解锁） ────────────────────
      sendSucc(res, {
        isPaid:           false,
        isInviteUnlocked: false,
        isFreeVersion:    false,
        personalityLabel: result.personalityLabel,
        freeSummary:      result.freeSummary,
        topCareers: result.topCareers.slice(0, 3).map((c) => {
          const aiRisk = buildFreeAiRisk(c.aiRisk, bands);
          return { code: c.code, title: c.title, matchScore: c.matchScore, aiRisk };
        }),
        aiRiskSummary: { total: allCareers.length, highCount },
      });
    }
  } catch (err) {
    logger.error("[report/get]", err);
    sendErr(res, "Internal error", 500);
  }
});

/** 免费层：从原始 aiRisk (0–1) 提取风险标志（不含应对建议） */
function buildFreeAiRisk(
  aiRisk: number | undefined,
  bands: ReturnType<typeof loadReportTemplate>["careers"]["ai_impact"]["risk_bands"],
): { badge: string; riskLabel: string; bandKey: "low" | "medium" | "high" } | null {
  if (aiRisk === undefined) return null;
  const bandKey: "low" | "medium" | "high" =
    aiRisk <= bands.low.max ? "low" :
    aiRisk <= bands.medium.max ? "medium" : "high";
  const band = bands[bandKey];
  return { badge: band.badge, riskLabel: band.label, bandKey };
}

/** 生成 Big5 胜任力解读（付费专属） */
function buildCompetencyAnalysis(big5: Record<string, number> | undefined): Record<string, string> {
  const desc: Record<string, [string, string]> = {
    O: ["开放性", (big5?.["O"] ?? 0) > 0 ? "你对新事物的接受程度高于同龄人，在快速迭代的 AI 时代具有明显的适应优势。" : "你更倾向于经过验证的方案，在需要稳定执行的岗位中表现出色。"],
    C: ["尽责性", (big5?.["C"] ?? 0) > 0 ? "你的自律性和计划执行力优于平均水平，是需要高精度输出的岗位首选。" : "你更注重灵活应对，适合动态变化的创业环境。"],
    E: ["外向性", (big5?.["E"] ?? 0) > 0 ? "你在社交场景中精力充沛，适合需要对外沟通和资源整合的角色。" : "你善于深度专注，在独立研究和技术攻坚中表现突出。"],
    A: ["宜人性", (big5?.["A"] ?? 0) > 0 ? "你具备较强的共情能力，在用户研究、教育培训等需要换位思考的领域尤为出色。" : "你敢于在必要时坚持原则，适合需要独立判断和决策的管理角色。"],
    N: ["情绪稳定性", (big5?.["N"] ?? 0) < 0 ? "你在压力下保持冷静的能力优于平均，高压项目对你来说是发光的机会。" : "你对外界变化敏感，建议选择节奏稳定、反馈及时的工作环境。"],
  };

  const result: Record<string, string> = {};
  for (const [dim, [name, text]] of Object.entries(desc)) {
    result[name] = text;
    void dim;
  }
  return result;
}

/**
 * BFI-2 子维度洞察（付费专属）
 * 对 15 个 facet 均分（1–5）中的极高（≥4.2）和极低（≤2.5）项给出具体描述
 */
function buildFacetInsights(facetMeans: Record<string, number>): { facet: string; label: string; score: number; insight: string }[] {
  const META: Record<string, { label: string; high: string; low: string }> = {
    Sociability:           { label: "社交性",   high: "你享受社交互动，善于在群体中展示自己。",           low: "你倾向于独处，在小圈子中更自在。" },
    Assertiveness:         { label: "果断性",   high: "你习惯主导讨论，敢于表达立场。",                   low: "你更倾向于观察和倾听，偏好支持而非引领。" },
    Energy:                { label: "活力",     high: "你精力旺盛，长时间保持高效状态对你并不困难。",     low: "你节奏偏慢，需要充足的恢复时间。" },
    Compassion:            { label: "同情心",   high: "你对他人的情绪高度敏感，善于共情。",               low: "你处事相对理性，不易被情绪左右。" },
    Respectfulness:        { label: "谦恭性",   high: "你注重礼仪，擅长维护和谐的人际关系。",             low: "你直言不讳，有时会显得强硬。" },
    Trust:                 { label: "信任感",   high: "你倾向于相信他人的善意，容易建立深度合作。",       low: "你对他人持审慎态度，适合需要风险把控的岗位。" },
    Organization:          { label: "条理性",   high: "你工作有序，文档和流程都维护得很规范。",           low: "你偏好灵活、非结构化的工作方式。" },
    Productiveness:        { label: "效率感",   high: "你目标感强，能持续高效地推进任务。",               low: "你容易陷入拖延，建议借助外部工具提升节律。" },
    Responsibility:        { label: "责任感",   high: "你对承诺极为认真，是团队可靠的压舱石。",           low: "你较为随性，更适合弹性较大的工作环境。" },
    Anxiety:               { label: "焦虑倾向", high: "你对风险和不确定性较为敏感，建议刻意练习情绪调节。", low: "你面对压力时镇定自若，抗压能力突出。" },
    Depression:            { label: "抑郁倾向", high: "你容易陷入低落情绪，建议建立固定的正念或运动习惯。", low: "你整体情绪积极，复原力强。" },
    EmotionalVolatility:   { label: "情绪稳定性", high: "你情绪起伏较大，建议在高压场景下练习暂停与反应。", low: "你情绪波动小，能在冲突中保持冷静。" },
    IntellectualCuriosity: { label: "求知欲",   high: "你对跨领域知识充满热情，学习新技能对你是享受。",   low: "你更关注实操而非理论，适合专注型工作。" },
    AestheticSensitivity:  { label: "审美敏感性", high: "你对色彩、设计和艺术有天然感知，是创意工作的优势。", low: "你偏重功能而非形式，适合数据与工程导向的岗位。" },
    CreativeImagination:   { label: "创造力",   high: "你善于打破常规，想象力是你在创新型团队的核心资产。", low: "你倾向于用成熟方案解决问题，可靠且可预期。" },
  };

  const results: { facet: string; label: string; score: number; insight: string }[] = [];
  for (const [facet, score] of Object.entries(facetMeans)) {
    const m = META[facet];
    if (!m) continue;
    if (score >= 4.2 || score <= 2.5) {
      results.push({
        facet,
        label: m.label,
        score: parseFloat(score.toFixed(2)),
        insight: score >= 4.2 ? m.high : m.low,
      });
    }
  }
  // 按分值降序排列，最突出的特质优先展示
  return results.sort((a, b) => Math.abs(b.score - 3) - Math.abs(a.score - 3));
}

/**
 * POST /report/:sessionId/claim-image
 * 原子性标记"已生成长图"，每个付费报告仅允许一次。
 * 前端渲染长图前必须先调用此接口，成功后才执行本地保存。
 */
router.post("/:sessionId/claim-image", authMiddleware, async (req: MiniappRequest, res: Response) => {
  const { sessionId } = req.params;
  try {
    const Sessions = getSessionModel();
    const Payments = getPaymentModel();

    // 验证 session 属于当前用户且已付费
    const session = await Sessions.findOne({ sessionId, openId: req.userId })
      .select("status")
      .lean()
      .exec();
    if (!session)              { sendErr(res, "Session not found", 404); return; }
    if (session.status !== "paid") { sendErr(res, "Report not unlocked", 403); return; }

    // 原子标记：只对 imageGenerated=false 的记录生效
    const updated = await Payments.findOneAndUpdate(
      { sessionId, status: "success", imageGenerated: false },
      { $set: { imageGenerated: true, imageGeneratedAt: new Date() } },
      { new: true }
    ).lean().exec();

    if (!updated) {
      // 已生成过，或找不到对应付费记录
      const existing = await Payments.findOne({ sessionId, status: "success" }).select("imageGenerated").lean().exec();
      if (existing?.imageGenerated) {
        sendErr(res, "Report image already generated", 403);
      } else {
        sendErr(res, "Payment record not found", 404);
      }
      return;
    }

    logger.info("[report/claim-image] claimed:", sessionId, req.userId);
    sendSucc(res, { allowed: true });
  } catch (err) {
    logger.error("[report/claim-image]", err);
    sendErr(res, "Internal error", 500);
  }
});

export default router;
