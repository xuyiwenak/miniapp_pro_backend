import { Schema } from "mongoose";

export type ModelType = "RIASEC" | "BIG5";

/** RIASEC 维度 */
export type RiasecDim = "R" | "I" | "A" | "S" | "E" | "C";
/** Big Five 维度 */
export type Big5Dim = "O" | "C" | "E" | "A" | "N";

export type QuestionGender = "male" | "female" | "both";

export interface IQuestion {
  questionId: string;
  modelType: ModelType;
  dimension: RiasecDim | Big5Dim;
  content: string;
  /** 计分权重，默认 1.0 */
  weight: number;
  /** 适用性别，both 表示不限 */
  gender: QuestionGender;
  /** 适用年龄下限（含），0 表示不限 */
  ageMin: number;
  /** 适用年龄上限（含），999 表示不限 */
  ageMax: number;
  isActive: boolean;
  createdAt: Date;
}

export const QuestionSchema = new Schema<IQuestion>(
  {
    questionId: { type: String, required: true, unique: true, index: true },
    modelType:  { type: String, required: true, enum: ["RIASEC", "BIG5"] },
    dimension:  { type: String, required: true },
    content:    { type: String, required: true },
    weight:     { type: Number, default: 1.0 },
    gender:     { type: String, enum: ["male", "female", "both"], default: "both" },
    ageMin:     { type: Number, default: 0 },
    ageMax:     { type: Number, default: 999 },
    isActive:   { type: Boolean, default: true, index: true },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } }
);
