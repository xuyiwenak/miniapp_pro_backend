import { Schema } from "mongoose";

export interface IOccupationNorm {
  code: string;
  title: string;
  /** 主霍兰德代码（单字母） */
  primaryRiasec: string;
  /** 次霍兰德代码 */
  secondaryRiasec: string;
  /** Big Five 胜任力阈值（归一化 Z 分，0 表示均值） */
  requiredBig5: {
    openness: number;
    conscientiousness: number;
    emotionalStability: number;
  };
  /** 2026 高薪指数 0-1 */
  salaryIndex: number;
  /** 年龄适配系数 */
  ageBonusMultiplier: number;
  ageRange: { min: number; max: number };
  description: string;
  isActive: boolean;
}

export const OccupationSchema = new Schema<IOccupationNorm>(
  {
    code:            { type: String, required: true, unique: true, index: true },
    title:           { type: String, required: true },
    primaryRiasec:   { type: String, required: true, index: true },
    secondaryRiasec: { type: String, required: true },
    requiredBig5: {
      openness:          { type: Number, default: 0 },
      conscientiousness: { type: Number, default: 0 },
      emotionalStability:{ type: Number, default: 0 },
    },
    salaryIndex:         { type: Number, default: 0.5 },
    ageBonusMultiplier:  { type: Number, default: 1.0 },
    ageRange: {
      min: { type: Number, default: 18 },
      max: { type: Number, default: 60 },
    },
    description: { type: String, default: "" },
    isActive:    { type: Boolean, default: true, index: true },
  },
  { timestamps: false }
);
