import type { Gender } from '../entity/session.entity';
import type { AgeGroup } from '../miniapp/services/CalculationEngine';

/**
 * BFI-2 领域分常模：量纲为「每领域 12 题、反向编码后的算术均分」，理论范围 1–5。
 * 以下为 Zhang 等 Assessment 2021 中国大学生样本的近似占位（请用论文 Table 1 精确替换并更新 normVersion）。
 * 各年龄段暂用同一组 college 常模；仅性别分栏。
 */
type Seg = Record<Gender | 'all', Record<AgeGroup, [number, number]>>;

function fillAgeGroups(m: [number, number]): Record<AgeGroup, [number, number]> {
  return {
    '18-24': m,
    '25-34': m,
    '35-44': m,
    '45+': m,
  };
}

/** 与 CalculationEngine 中 BIG5_KEY_MAP 一致：O / BIG5_C / BIG5_E / BIG5_A / N */
export const BFI2_DOMAIN_NORM_MEAN_SD: Record<string, Seg> = {
  O: {
    all: fillAgeGroups([3.41, 0.64]),
    male: fillAgeGroups([3.38, 0.65]),
    female: fillAgeGroups([3.44, 0.63]),
  },
  BIG5_C: {
    all: fillAgeGroups([3.51, 0.62]),
    male: fillAgeGroups([3.48, 0.63]),
    female: fillAgeGroups([3.54, 0.61]),
  },
  BIG5_E: {
    all: fillAgeGroups([3.29, 0.71]),
    male: fillAgeGroups([3.33, 0.72]),
    female: fillAgeGroups([3.25, 0.69]),
  },
  BIG5_A: {
    all: fillAgeGroups([3.63, 0.59]),
    male: fillAgeGroups([3.55, 0.60]),
    female: fillAgeGroups([3.68, 0.57]),
  },
  N: {
    all: fillAgeGroups([2.88, 0.76]),
    male: fillAgeGroups([2.75, 0.77]),
    female: fillAgeGroups([2.96, 0.74]),
  },
};
