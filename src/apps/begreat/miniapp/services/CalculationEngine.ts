import type { Gender } from "../../entity/session.entity";

export type AgeGroup = "18-24" | "25-34" | "35-44" | "45+";

export function getAgeGroup(age: number): AgeGroup {
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  return "45+";
}

/**
 * 2026 常模：[mean, sd]
 * 基准：4 题 × Likert 5 分 → 原始分范围 4-20，中性预期均值 12。
 * 2026 修正：
 *  - 开放性 (O/R/I/A): 年轻群体（18-24）基准均值上移 +1（同龄竞争更强）
 *  - 尽责性 (C): 中年群体（35-44）基准均值上移 +0.5
 *  - 宜人性 (A): 女性基准均值上移 +0.5
 */
type NormTable = Record<string, Record<Gender | "all", Record<AgeGroup, [number, number]>>>;

const NORMS: NormTable = {
  // RIASEC
  R: { all: { "18-24": [11.5,3.2], "25-34": [12.0,3.3], "35-44": [12.5,3.2], "45+": [12.0,3.0] }, male: { "18-24": [12.0,3.2], "25-34": [12.5,3.3], "35-44": [13.0,3.2], "45+": [12.5,3.0] }, female: { "18-24": [11.0,3.0], "25-34": [11.5,3.0], "35-44": [12.0,3.0], "45+": [11.5,2.8] } },
  I: { all: { "18-24": [12.5,3.3], "25-34": [12.0,3.2], "35-44": [12.0,3.2], "45+": [11.5,3.0] }, male: { "18-24": [12.8,3.3], "25-34": [12.3,3.2], "35-44": [12.3,3.2], "45+": [11.8,3.0] }, female: { "18-24": [12.2,3.2], "25-34": [11.7,3.1], "35-44": [11.7,3.1], "45+": [11.2,2.9] } },
  A: { all: { "18-24": [13.0,3.5], "25-34": [12.5,3.4], "35-44": [12.0,3.3], "45+": [11.5,3.2] }, male: { "18-24": [12.5,3.5], "25-34": [12.0,3.4], "35-44": [11.5,3.3], "45+": [11.0,3.2] }, female: { "18-24": [13.5,3.5], "25-34": [13.0,3.4], "35-44": [12.5,3.3], "45+": [12.0,3.2] } },
  S: { all: { "18-24": [13.0,3.2], "25-34": [13.0,3.2], "35-44": [13.0,3.2], "45+": [12.5,3.0] }, male: { "18-24": [12.5,3.2], "25-34": [12.5,3.2], "35-44": [12.5,3.2], "45+": [12.0,3.0] }, female: { "18-24": [13.5,3.2], "25-34": [13.5,3.2], "35-44": [13.5,3.2], "45+": [13.0,3.0] } },
  E: { all: { "18-24": [12.0,3.3], "25-34": [12.5,3.3], "35-44": [12.5,3.2], "45+": [12.0,3.0] }, male: { "18-24": [12.3,3.3], "25-34": [12.8,3.3], "35-44": [12.8,3.2], "45+": [12.3,3.0] }, female: { "18-24": [11.7,3.3], "25-34": [12.2,3.3], "35-44": [12.2,3.2], "45+": [11.7,3.0] } },
  C: { all: { "18-24": [11.5,3.0], "25-34": [12.0,3.0], "35-44": [13.0,3.0], "45+": [13.0,3.0] }, male: { "18-24": [11.5,3.0], "25-34": [12.0,3.0], "35-44": [13.0,3.0], "45+": [13.0,3.0] }, female: { "18-24": [11.5,3.0], "25-34": [12.0,3.0], "35-44": [13.0,3.0], "45+": [13.0,3.0] } },
  // Big Five
  O: { all: { "18-24": [13.5,3.5], "25-34": [12.8,3.4], "35-44": [12.0,3.3], "45+": [11.5,3.2] }, male: { "18-24": [13.3,3.5], "25-34": [12.5,3.4], "35-44": [11.8,3.3], "45+": [11.3,3.2] }, female: { "18-24": [13.7,3.5], "25-34": [13.1,3.4], "35-44": [12.2,3.3], "45+": [11.7,3.2] } },
  // C (BIG5 Conscientiousness) 与 RIASEC-C 同 key，通过 modelType 区分，但算分时传同维度字母即可
  // 实际同字母不冲突：RIASEC 的 C 和 Big5 的 C 分开累加
  BIG5_C: { all: { "18-24": [12.0,3.2], "25-34": [12.5,3.2], "35-44": [13.5,3.2], "45+": [13.5,3.0] }, male: { "18-24": [12.0,3.2], "25-34": [12.5,3.2], "35-44": [13.5,3.2], "45+": [13.5,3.0] }, female: { "18-24": [12.0,3.2], "25-34": [12.5,3.2], "35-44": [13.5,3.2], "45+": [13.5,3.0] } },
  // E (Big5 Extraversion)
  BIG5_E: { all: { "18-24": [12.5,3.3], "25-34": [12.5,3.3], "35-44": [12.0,3.2], "45+": [11.5,3.0] }, male: { "18-24": [12.5,3.3], "25-34": [12.5,3.3], "35-44": [12.0,3.2], "45+": [11.5,3.0] }, female: { "18-24": [12.5,3.3], "25-34": [12.5,3.3], "35-44": [12.0,3.2], "45+": [11.5,3.0] } },
  // A (Big5 Agreeableness)
  BIG5_A: { all: { "18-24": [13.0,3.2], "25-34": [13.0,3.2], "35-44": [13.0,3.2], "45+": [13.0,3.0] }, male: { "18-24": [12.5,3.2], "25-34": [12.5,3.2], "35-44": [12.5,3.2], "45+": [12.5,3.0] }, female: { "18-24": [13.5,3.2], "25-34": [13.5,3.2], "35-44": [13.5,3.2], "45+": [13.5,3.0] } },
  // N (Neuroticism: 高 N = 低情绪稳定性)
  N: { all: { "18-24": [12.5,3.5], "25-34": [12.0,3.4], "35-44": [11.5,3.3], "45+": [11.0,3.2] }, male: { "18-24": [12.0,3.5], "25-34": [11.5,3.4], "35-44": [11.0,3.3], "45+": [10.5,3.2] }, female: { "18-24": [13.0,3.5], "25-34": [12.5,3.4], "35-44": [12.0,3.3], "45+": [11.5,3.2] } },
};

/** Big5 维度在常模表中的 key（避免与 RIASEC 的 C/E/A 重名） */
const BIG5_KEY_MAP: Record<string, string> = {
  O: "O",
  C: "BIG5_C",
  E: "BIG5_E",
  A: "BIG5_A",
  N: "N",
};

/**
 * 计算单维度 Z 分（2026 常模修正）
 * @param rawScore  原始分（RIASEC: 4-20；Big5: 4-20）
 * @param dimension RIASEC: R/I/A/S/E/C；Big5: O/C/E/A/N
 * @param gender    性别
 * @param age       年龄
 * @param isBig5    是否为 Big5 维度
 */
export function calculateNormalizedScore(
  rawScore: number,
  dimension: string,
  gender: Gender,
  age: number,
  isBig5 = false
): number {
  const ageGroup = getAgeGroup(age);
  const key = isBig5 ? (BIG5_KEY_MAP[dimension] ?? dimension) : dimension;
  const table = NORMS[key];
  if (!table) return 0;

  // 优先取性别专项常模，不存在时回退 all
  const genderNorm = table[gender]?.[ageGroup] ?? table.all[ageGroup];
  if (!genderNorm) return 0;

  const [mean, sd] = genderNorm;
  if (sd === 0) return 0;
  return parseFloat(((rawScore - mean) / sd).toFixed(3));
}

/**
 * 批量计算所有维度的 Z 分
 */
export function computeAllNormalizedScores(
  rawRiasec: Record<string, number>,
  rawBig5: Record<string, number>,
  gender: Gender,
  age: number
): { riasecNorm: Record<string, number>; big5Norm: Record<string, number> } {
  const riasecNorm: Record<string, number> = {};
  for (const [dim, score] of Object.entries(rawRiasec)) {
    riasecNorm[dim] = calculateNormalizedScore(score, dim, gender, age, false);
  }

  const big5Norm: Record<string, number> = {};
  for (const [dim, score] of Object.entries(rawBig5)) {
    big5Norm[dim] = calculateNormalizedScore(score, dim, gender, age, true);
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
 * 根据 RIASEC 顶维度生成性格标签（2026 重写版，不引用任何官方版权文案）
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
