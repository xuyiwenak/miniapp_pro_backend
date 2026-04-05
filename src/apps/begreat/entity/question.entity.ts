import { Schema } from "mongoose";

export type ModelType = "RIASEC" | "BIG5";

/** RIASEC 维度 */
export type RiasecDim = "R" | "I" | "A" | "S" | "E" | "C";
/** Big Five 维度 */
export type Big5Dim = "O" | "C" | "E" | "A" | "N";

export interface IQuestion {
  questionId: string;
  modelType: ModelType;
  dimension: RiasecDim | Big5Dim;
  content: string;
  /** 计分权重，默认 1.0 */
  weight: number;
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
    isActive:   { type: Boolean, default: true, index: true },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } }
);
