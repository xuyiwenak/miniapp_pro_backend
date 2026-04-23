import { Schema } from "mongoose";
import type { AgeGroup } from "./norm.entity";

export type OccupationLevel = "entry" | "mid" | "senior";

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
  /** 年龄适配系数（按年龄段分段配置） */
  ageBonusMultiplier: Record<AgeGroup, number>;
  /** 年龄适用范围（用于过滤不符合年龄段的职业） */
  ageRange: { min: number; max: number };
  description: string;
  isActive: boolean;

  /** 行业分类 */
  industry?: { primary: string; secondary: string };
  /** 职业阶段（入门/中级/资深） */
  level?: OccupationLevel;
  /** 薪资区间（元/月 或 元/年） */
  salary?: { min: number; max: number; unit: "month" | "year" };
  /** 所需技能 */
  skills?: { required: string[]; tools: string[] };
  /** AI 替代风险（0–1，值越高风险越大） */
  aiRisk?: number;
  /** 职业专属 AI 应对建议（优先级高于行业通用建议） */
  aiImpactAdvice?: string;
  /** 各年龄段情境化说明，key 为 AgeGroup */
  ageHints?: Partial<Record<AgeGroup, string>>;
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
    ageBonusMultiplier:  {
      type: Schema.Types.Mixed,
      default: { "18-24": 1.0, "25-34": 1.0, "35-44": 1.0, "45+": 1.0 }
    },
    ageRange: {
      min: { type: Number, default: 18 },
      max: { type: Number, default: 60 },
    },
    description: { type: String, default: "" },
    isActive:    { type: Boolean, default: true, index: true },

    industry: {
      primary:   { type: String },
      secondary: { type: String },
    },
    level:   { type: String, enum: ["entry", "mid", "senior"] },
    salary: {
      min:  { type: Number },
      max:  { type: Number },
      unit: { type: String, enum: ["month", "year"], default: "month" },
    },
    skills: {
      required: { type: [String], default: [] },
      tools:    { type: [String], default: [] },
    },
    aiRisk:         { type: Number, min: 0, max: 1 },
    aiImpactAdvice: { type: String },
    ageHints:       { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: false }
);
