/**
 * BFI-2 中国大学生常模（领域均分 1–5 的 M/SD）。
 * 数值占位：请用 Zhang et al. Assessment 2021 Table 1「Chinese college」列替换以提高可比性。
 */
import type { Gender } from "../entity/session.entity";

type AgeGroup = "18-24" | "25-34" | "35-44" | "45+";

type Seg = Record<AgeGroup, [number, number]>;

function sameCollege(m: number, sd: number): Record<Gender | "all", Seg> {
  const row: Seg = {
    "18-24": [m, sd],
    "25-34": [m, sd],
    "35-44": [m, sd],
    "45+": [m, sd],
  };
  return { all: row, male: row, female: row };
}

/** 领域键与 big5 维度 O/C/E/A/N 一致 */
export const BFI2_ZHANG2021_COLLEGE_DOMAIN: Record<string, Record<Gender | "all", Seg>> = {
  O: sameCollege(3.42, 0.64),
  C: sameCollege(3.55, 0.61),
  E: sameCollege(3.31, 0.69),
  A: sameCollege(3.68, 0.57),
  N: sameCollege(2.82, 0.76),
};
