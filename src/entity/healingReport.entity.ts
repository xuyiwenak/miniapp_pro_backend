import { Schema } from "mongoose";

export interface IHealingScores {
  calm: number;
  stress: number;
  joy: number;
  sadness: number;
}

export interface IHealingReport {
  userId: string;
  workId: string;
  scores: IHealingScores;
  summary: string;
  colorAnalysis: string;
  status: "pending" | "success" | "failed";
  isPublic: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const HealingReportSchema = new Schema<IHealingReport>(
  {
    userId: { type: String, required: true, index: true },
    workId: { type: String, required: true, unique: true },
    scores: {
      calm: { type: Number, required: true },
      stress: { type: Number, required: true },
      joy: { type: Number, required: true },
      sadness: { type: Number, required: true },
    },
    summary: { type: String, required: true },
    colorAnalysis: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "success",
      index: true,
    },
    isPublic: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

