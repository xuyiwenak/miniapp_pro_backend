import type { Gender } from "../../entity/session.entity";
import type { AgeGroup } from "../../entity/norm.entity";
import { getNormModel } from "../../dbservice/BegreatDBModel";

export type { AgeGroup };

export function getAgeGroup(age: number): AgeGroup {
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  return "45+";
}

// ── 常模缓存 ─────────────────────────────────────────────────────────────────
// key: `${normVersion}|${modelType}|${dimension}|${gender}|${ageGroup}`

type NormCache = Map<string, [number, number]>;

const normCacheStore = new Map<string, NormCache>(); // per normVersion

function normCacheKey(modelType: string, dimension: string, gender: string, ageGroup: string) {
  return `${modelType}|${dimension}|${gender}|${ageGroup}`;
}

/**
 * 加载指定版本的全部常模到内存缓存（每个版本只查一次 DB）
 */
async function loadNormCache(normVersion: string): Promise<NormCache> {
  if (normCacheStore.has(normVersion)) return normCacheStore.get(normVersion)!;

  const NormModel = getNormModel();
  const docs = await NormModel.find({ normVersion }).lean().exec();

  const cache: NormCache = new Map();
  for (const d of docs) {
    cache.set(normCacheKey(d.modelType, d.dimension, d.gender, d.ageGroup), [d.mean, d.sd]);
  }
  normCacheStore.set(normVersion, cache);
  return cache;
}

/**
 * 查询当前激活的常模版本号（BIG5 / RIASEC 共用同一激活版本机制）
 */
export async function getActiveNormVersion(modelType: "BIG5" | "RIASEC" = "BIG5"): Promise<string | null> {
  const NormModel = getNormModel();
  const doc = await NormModel.findOne({ isActive: true, modelType }).select("normVersion").lean().exec();
  return doc?.normVersion ?? null;
}

/**
 * 查询常模的 source / sampleSize 等元信息（用于报告展示）
 */
export async function getNormMeta(normVersion: string): Promise<{ source: string; sampleSize: number | null } | null> {
  const NormModel = getNormModel();
  const doc = await NormModel.findOne({ normVersion }).select("source sampleSize").lean().exec();
  if (!doc) return null;
  return { source: doc.source, sampleSize: doc.sampleSize ?? null };
}

// ── 计分 ─────────────────────────────────────────────────────────────────────

/**
 * 计算单维度 Z 分（从 DB 缓存读常模）
 * @param rawScore  BIG5：领域均分 1–5；RIASEC：4 题之和 4–20
 */
export async function calculateNormalizedScore(
  rawScore:   number,
  modelType:  "BIG5" | "RIASEC",
  dimension:  string,
  gender:     Gender,
  age:        number,
  normVersion: string,
): Promise<number> {
  const ageGroup = getAgeGroup(age);
  const cache = await loadNormCache(normVersion);

  // 优先取性别分组，回退到 all
  const [mean, sd] =
    cache.get(normCacheKey(modelType, dimension, gender, ageGroup)) ??
    cache.get(normCacheKey(modelType, dimension, "all", ageGroup)) ??
    [0, 0];

  if (sd === 0) return 0;
  return parseFloat(((rawScore - mean) / sd).toFixed(3));
}

/**
 * 批量计算所有维度的 Z 分
 */
export async function computeAllNormalizedScores(
  rawRiasec:        Record<string, number>,
  rawBig5DomainMean: Record<string, number>,
  gender:           Gender,
  age:              number,
  normVersion:      string,
): Promise<{ riasecNorm: Record<string, number>; big5Norm: Record<string, number> }> {
  const riasecNorm: Record<string, number> = {};
  for (const [dim, score] of Object.entries(rawRiasec)) {
    riasecNorm[dim] = await calculateNormalizedScore(score, "RIASEC", dim, gender, age, normVersion);
  }

  const big5Norm: Record<string, number> = {};
  for (const [dim, score] of Object.entries(rawBig5DomainMean)) {
    big5Norm[dim] = await calculateNormalizedScore(score, "BIG5", dim, gender, age, normVersion);
  }

  return { riasecNorm, big5Norm };
}

/** 按 Z 分降序排列，返回 top N 维度代码 */
export function topDimensions(normScores: Record<string, number>, n = 2): string[] {
  return Object.entries(normScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([dim]) => dim);
}

/**
 * 根据 RIASEC 顶维度生成性格标签
 */
export function buildPersonalityLabel(topRiasec: string[]): { label: string; summary: string } {
  const map: Record<string, { label: string; summary: string }> = {
    R:  { label: "实践开拓者", summary: "你擅长将想法转化为可触摸的成果，是团队中解决实际问题的核心力量。" },
    I:  { label: "洞察探索者", summary: "你对未知领域充满好奇，习惯用数据和逻辑拆解复杂问题。" },
    A:  { label: "创意表达者", summary: "你拥有敏锐的审美直觉，能将抽象概念转化为令人印象深刻的作品。" },
    S:  { label: "连接影响者", summary: "你天生擅长理解他人需求，是团队中情感纽带与协作的推动者。" },
    E:  { label: "进取领导者", summary: "你对目标有强烈的驱动力，善于调动资源、说服他人、推动变革。" },
    C:  { label: "系统构建者", summary: "你对秩序和精确性有天然偏好，是流程优化和风险防范的专家。" },
    RI: { label: "工程创新家", summary: "兼具动手能力与研究精神，在技术研发和产品实现领域有独特优势。" },
    IA: { label: "科技美学家", summary: "将分析思维与创意表达融合，是数字产品设计的理想人才。" },
    AE: { label: "艺术领导者", summary: "创意与行动力并驾，擅长将创新愿景带入商业落地。" },
    SE: { label: "人文运营家", summary: "深度理解人心，同时具备驱动团队达成目标的行动能量。" },
    IC: { label: "精密研究者", summary: "严谨的探究精神配合系统化工作习惯，是数据科学与合规领域的中坚力量。" },
    EC: { label: "战略执行者", summary: "目标导向与精细管理的结合，让你在需要高度执行力的管理岗位上游刃有余。" },
  };

  const key2 = topRiasec.slice(0, 2).join("");
  const key1 = topRiasec[0] ?? "";
  return map[key2] ?? map[key1] ?? { label: "全能型人才", summary: "你在多个维度均衡发展，具备适应多样化工作场景的弹性。" };
}
