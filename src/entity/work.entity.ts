import { Schema } from 'mongoose';

/** 情绪维度得分，key 由后端 SCORE_DIMENSIONS 配置驱动，支持任意扩展 */
export type IHealingScores = Record<string, number>;

export interface IHealingLineAnalysis {
  interpretation?: string;
  style?: string;
  energy_score?: number;
}

export interface IHealingVad {
  valence: number;
  arousal: number;
  dominance: number;
  quadrant: string;
  interpretation: string;
}

export interface IHealingData {
  scores: IHealingScores;
  summary: string;
  colorAnalysis: string;
  status: 'pending' | 'success' | 'failed';
  isPublic: boolean;
  submittedAt?: Date;
  analyzedAt?: Date;
  cozeRunId?: string;
  compositionReport?: string;
  lineAnalysis?: IHealingLineAnalysis;
  suggestion?: string;
  keyColors?: string[];
  failReason?: string;
  vad?: IHealingVad;
}

export interface IWork {
  workId: string;
  authorId?: string | null;
  desc: string;
  images: { url: string; name: string; type: string }[];
  tags: string[];
  location?: string;
  status: 'draft' | 'published';
  featured?: boolean;
  onWall?: boolean;
  healing?: IHealingData | null;
  classroomId?: string;
  participantId?: string;
  uploaderRole?: 'student' | 'teacher';
  uploadReason?: string;
  contentHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const HealingLineAnalysisSubSchema = new Schema(
  {
    interpretation: { type: String },
    style: { type: String },
    energy_score: { type: Number },
  },
  { _id: false },
);

const HealingDataSubSchema = new Schema<IHealingData>(
  {
    scores: { type: Schema.Types.Mixed, default: {} },
    summary: { type: String, required: true },
    colorAnalysis: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
    },
    isPublic: { type: Boolean, default: false },
    submittedAt: { type: Date },
    analyzedAt: { type: Date },
    cozeRunId: { type: String },
    compositionReport: { type: String },
    lineAnalysis: { type: HealingLineAnalysisSubSchema },
    suggestion: { type: String },
    keyColors: [{ type: String }],
    failReason: { type: String },
    vad: {
      type: new Schema(
        {
          valence: { type: Number, required: true },
          arousal: { type: Number, required: true },
          dominance: { type: Number, required: true },
          quadrant: { type: String, required: true },
          interpretation: { type: String, required: true },
        },
        { _id: false },
      ),
    },
  },
  { _id: false },
);

export const WorkSchema = new Schema<IWork>(
  {
    workId: { type: String, required: true, unique: true },
    authorId: { type: String, index: true },
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
      enum: ['draft', 'published'],
      required: true,
      index: true,
    },
    featured: { type: Boolean, default: false, index: true },
    onWall: { type: Boolean, default: false, index: true },
    healing: { type: HealingDataSubSchema, default: null },
    classroomId: { type: String, index: true },
    participantId: { type: String, index: true },
    uploaderRole: { type: String, enum: ['student', 'teacher'] },
    uploadReason: { type: String },
    contentHash: { type: String },
  },
  { timestamps: true },
);

WorkSchema.index({ authorId: 1, status: 1, createdAt: -1 });
WorkSchema.index({ status: 1, 'healing.isPublic': 1, featured: 1, createdAt: -1 });
WorkSchema.index({ classroomId: 1, participantId: 1 }, { unique: true, sparse: true });
WorkSchema.index({ classroomId: 1, contentHash: 1 }, { unique: true, sparse: true });
