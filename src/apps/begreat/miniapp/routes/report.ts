import { Router, Response } from "express";
import { sendSucc, sendErr } from "../../../../shared/miniapp/middleware/response";
import { authMiddleware, type MiniappRequest } from "../../../../shared/miniapp/middleware/auth";
import { getSessionModel } from "../../dbservice/BegreatDBModel";
import { gameLogger as logger } from "../../../../util/logger";

const router = Router();

/**
 * GET /report/:sessionId
 * 免费：返回 personalityLabel + freeSummary + topCareers 前3名标题
 * 付费：返回完整 result（所有职业 + Big5 详情 + 胜任力分析）
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

    const isPaid = session.status === "paid";
    const { result } = session;

    if (!isPaid) {
      // 免费版：仅展示顶层标签，职业只给前3名且不含详细描述
      sendSucc(res, {
        isPaid: false,
        personalityLabel: result.personalityLabel,
        freeSummary:      result.freeSummary,
        topCareers: result.topCareers.slice(0, 3).map((c) => ({
          title:       c.title,
          matchScore:  c.matchScore,
        })),
      });
    } else {
      // 付费版：完整报告
      sendSucc(res, {
        isPaid: true,
        personalityLabel: result.personalityLabel,
        freeSummary:      result.freeSummary,
        riasecNormalized: result.riasecNormalized,
        big5Normalized:   result.big5Normalized,
        topCareers:       result.topCareers,
        competencyAnalysis: buildCompetencyAnalysis(result.big5Normalized),
        aiEraAdvice:        buildAiEraAdvice(result.riasecNormalized, result.big5Normalized),
      });
    }
  } catch (err) {
    logger.error("[report/get]", err);
    sendErr(res, "Internal error", 500);
  }
});

/** 生成 Big5 胜任力解读（付费专属） */
function buildCompetencyAnalysis(big5: Record<string, number>): Record<string, string> {
  const desc: Record<string, [string, string]> = {
    O: ["开放性", big5["O"] > 0 ? "你对新事物的接受程度高于同龄人，在快速迭代的 AI 时代具有明显的适应优势。" : "你更倾向于经过验证的方案，在需要稳定执行的岗位中表现出色。"],
    C: ["尽责性", big5["C"] > 0 ? "你的自律性和计划执行力优于平均水平，是需要高精度输出的岗位首选。" : "你更注重灵活应对，适合动态变化的创业环境。"],
    E: ["外向性", big5["E"] > 0 ? "你在社交场景中精力充沛，适合需要对外沟通和资源整合的角色。" : "你善于深度专注，在独立研究和技术攻坚中表现突出。"],
    A: ["宜人性", big5["A"] > 0 ? "你具备较强的共情能力，在用户研究、教育培训等需要换位思考的领域尤为出色。" : "你敢于在必要时坚持原则，适合需要独立判断和决策的管理角色。"],
    N: ["情绪稳定性", (big5["N"] ?? 0) < 0 ? "你在压力下保持冷静的能力优于平均，高压项目对你来说是发光的机会。" : "你对外界变化敏感，建议选择节奏稳定、反馈及时的工作环境。"],
  };

  const result: Record<string, string> = {};
  for (const [dim, [name, text]] of Object.entries(desc)) {
    result[name] = text;
    void dim;
  }
  return result;
}

/** AI 时代技能补全建议（付费专属） */
function buildAiEraAdvice(riasec: Record<string, number>, big5: Record<string, number>): string[] {
  const advice: string[] = [];

  if ((big5["O"] ?? 0) < 0) {
    advice.push("建议每月尝试 1 个新的 AI 工具（如 Midjourney、Cursor 或 Perplexity），主动拓宽你对技术边界的认知。");
  }
  if ((riasec["I"] ?? 0) < 0) {
    advice.push("尝试将工作中的重复决策流程文档化并交给 AI 辅助，这能大幅提升你的产出效率。");
  }
  if ((riasec["A"] ?? 0) > 0.5) {
    advice.push("你的创意优势可与生成式 AI 结合：用 AI 快速出稿、你负责审美把控，这是 2026 年内容岗位的核心竞争力。");
  }
  if ((big5["C"] ?? 0) < 0) {
    advice.push("使用 AI 项目管理工具（如 Notion AI 或 ClickUp）为你建立外部纪律，弥补自律性的短板。");
  }
  if ((riasec["S"] ?? 0) > 0.5) {
    advice.push("你擅长与人建立联结，建议学习 AI 辅助用户研究工具，将你的同理心转化为可量化的产品洞察。");
  }
  if (advice.length === 0) {
    advice.push("你的能力结构与 2026 年职场需求高度匹配，建议持续深耕核心专业，同时保持对 AI 工具的关注与实践。");
  }
  return advice;
}

export default router;
