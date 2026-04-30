import { Schema } from 'mongoose';

export type ModelType = 'RIASEC' | 'BIG5';

/** RIASEC 维度 */
export type RiasecDim = 'R' | 'I' | 'A' | 'S' | 'E' | 'C';
/** Big Five 维度 */
export type Big5Dim = 'O' | 'C' | 'E' | 'A' | 'N';

export type QuestionGender = 'male' | 'female' | 'both';

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
  /** BFI-2 官方题号 1–60（仅 BIG5 且 BFI-2 题库） */
  bfiItemNo?: number;
  /** 是否反向计分（填答后先作 6−分） */
  bfiReverse?: boolean;
  /** BFI-2 子维度键（如 Sociability） */
  bfiFacet?: string;
}

export const QuestionSchema = new Schema<IQuestion>(
  {
    questionId: { type: String, required: true, unique: true, index: true },
    modelType:  { type: String, required: true, enum: ['RIASEC', 'BIG5'] },
    dimension:  { type: String, required: true },
    content:    { type: String, required: true },
    weight:     { type: Number, default: 1.0 },
    gender:     { type: String, enum: ['male', 'female', 'both'], required: true, index: true },
    ageMin:     { type: Number, default: 0 },
    ageMax:     { type: Number, default: 999 },
    isActive:   { type: Boolean, default: true, index: true },
    bfiItemNo:  { type: Number, required: false, index: true },
    bfiReverse: { type: Boolean, required: false },
    bfiFacet:   { type: String, required: false },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);
