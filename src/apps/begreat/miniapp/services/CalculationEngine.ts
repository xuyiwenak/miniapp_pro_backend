import type { Gender } from '../../entity/session.entity';
import type { AgeGroup } from '../../entity/norm.entity';
import { getNormModel } from '../../dbservice/BegreatDBModel';

export type { AgeGroup };

export function getAgeGroup(age: number): AgeGroup {
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  return '45+';
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
  const cached = normCacheStore.get(normVersion);
  if (cached) return cached;

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
 * 查询当前激活的常模版本号
 */
export async function getActiveNormVersion(modelType: 'BIG5' = 'BIG5'): Promise<string | null> {
  const NormModel = getNormModel();
  const doc = await NormModel.findOne({ isActive: true, modelType }).select('normVersion').lean().exec();
  return doc?.normVersion ?? null;
}

/**
 * 查询常模的 source / sampleSize 等元信息（用于报告展示）
 */
export async function getNormMeta(normVersion: string): Promise<{ source: string; sampleSize: number | null } | null> {
  const NormModel = getNormModel();
  const doc = await NormModel.findOne({ normVersion }).select('source sampleSize').lean().exec();
  if (!doc) return null;
  return { source: doc.source, sampleSize: doc.sampleSize ?? null };
}

// ── 计分 ─────────────────────────────────────────────────────────────────────

/**
 * 计算单维度 Z 分（从 DB 缓存读常模）
 * @param rawScore  BIG5 领域均分 1–5
 */
export async function calculateNormalizedScore(
  rawScore:   number,
  modelType:  'BIG5',
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
    cache.get(normCacheKey(modelType, dimension, 'all', ageGroup)) ??
    [0, 0];

  if (sd === 0) return 0;
  return parseFloat(((rawScore - mean) / sd).toFixed(3));
}

/**
 * 批量计算 Big5 各维度 Z 分
 */
export async function computeAllNormalizedScores(
  rawBig5DomainMean: Record<string, number>,
  gender:            Gender,
  age:               number,
  normVersion:       string,
): Promise<Record<string, number>> {
  const big5Norm: Record<string, number> = {};
  for (const [dim, score] of Object.entries(rawBig5DomainMean)) {
    big5Norm[dim] = await calculateNormalizedScore(score, 'BIG5', dim, gender, age, normVersion);
  }
  return big5Norm;
}

/**
 * 根据 Big5 Z 分生成性格标签（取最突出维度；N 取反，低神经质=高稳定性）
 */
export function buildPersonalityLabel(big5Norm: Record<string, number>): { label: string; summary: string } {
  const scores: [string, number][] = [
    ['O', big5Norm['O'] ?? 0],
    ['C', big5Norm['C'] ?? 0],
    ['E', big5Norm['E'] ?? 0],
    ['A', big5Norm['A'] ?? 0],
    ['N_stable', -(big5Norm['N'] ?? 0)],
  ];
  const [top] = scores.sort((a, b) => b[1] - a[1]);
  const map: Record<string, { label: string; summary: string }> = {
    O:        { label: '开放探索者', summary: '你对新事物充满好奇，善于跨界思考，是团队中创新灵感的重要来源。' },
    C:        { label: '系统执行者', summary: '你自律严谨、目标感强，是团队中可靠的计划推进者与成果保障人。' },
    E:        { label: '社交驱动者', summary: '你充满活力、善于表达，在需要沟通协调和资源整合的场景中游刃有余。' },
    A:        { label: '温暖协作者', summary: '你富有同理心，注重和谐关系，是团队中情感纽带与深度协作的推动者。' },
    N_stable: { label: '稳健应对者', summary: '你情绪稳定、抗压能力强，在高压与不确定环境中依然能够保持冷静判断。' },
  };
  return map[top?.[0] ?? ''] ?? { label: '均衡发展者', summary: '你在多个维度均衡发展，具备适应多样化工作场景的弹性与韧性。' };
}
