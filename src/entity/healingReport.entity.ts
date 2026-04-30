import { Schema } from 'mongoose';

/** 情绪维度得分，key 由后端 SCORE_DIMENSIONS 配置驱动，支持任意扩展 */
export type IHealingScores = Record<string, number>;

export interface IHealingReport {
  userId: string;
  workId: string;
  scores: IHealingScores;
  summary: string;
  colorAnalysis: string;
  status: 'pending' | 'success' | 'failed';
  isPublic: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const HealingReportSchema = new Schema<IHealingReport>(
  {
    userId: { type: String, required: true, index: true },
    workId: { type: String, required: true, unique: true },
    scores: { type: Schema.Types.Mixed, default: {} },
    summary: { type: String, required: true },
    colorAnalysis: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'success',
      index: true,
    },
    isPublic: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

