import { Schema } from "mongoose";

export interface IHealingScores {
  calm: number;
  stress: number;
  joy: number;
  sadness: number;
}

export interface IHealingData {
  scores: IHealingScores;
  summary: string;
  colorAnalysis: string;
  status: "pending" | "success" | "failed";
  isPublic: boolean;
  analyzedAt?: Date;
}

export interface IWork {
  workId: string;
  authorId?: string | null;
  desc: string;
  images: { url: string; name: string; type: string }[];
  tags: string[];
  location?: string;
  status: "draft" | "published";
  healing?: IHealingData | null;
  createdAt: Date;
  updatedAt: Date;
}

const HealingDataSubSchema = new Schema<IHealingData>(
  {
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
    },
    isPublic: { type: Boolean, default: true },
    analyzedAt: { type: Date },
  },
  { _id: false },
);

export const WorkSchema = new Schema<IWork>(
  {
    workId: { type: String, required: true, unique: true },
    authorId: { type: String },
    desc: { type: String, required: false },
    images: [
      {
        url: { type: String, required: true },
        name: { type: String, required: true },
        type: { type: String, required: true },
      },
    ],
    tags: [{ type: String }],
    location: { type: String },
    status: {
      type: String,
      enum: ["draft", "published"],
      required: true,
      index: true,
    },
    healing: { type: HealingDataSubSchema, default: null },
  },
  { timestamps: true },
);
