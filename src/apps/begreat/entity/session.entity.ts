import { Schema } from "mongoose";

export type SessionStatus = "in_progress" | "completed" | "paid";
export type Gender = "male" | "female";
export type AssessmentType = "BFI2" | "MBTI" | "DISC";

export interface ICareerMatch {
  code: string;
  title: string;
  matchScore: number;
  salaryIndex: number;
  description: string;
}

export interface IAssessmentResult {
  riasecScores:     Record<string, number>;  // 原始分
  /** BFI-2 五领域均分（1–5，已反向计分） */
  big5Scores:       Record<string, number>;
  /** 各域 12 题 raw 分和（12–60，已反向） */
  big5DomainSum?:   Record<string, number>;
  /** BFI-2 十五子维度均分（1–5） */
  bfi2FacetMeans?:  Record<string, number>;
  riasecNormalized: Record<string, number>;  // Z 分
  big5Normalized:   Record<string, number>;
  topCareers:       ICareerMatch[];          // 匹配职业，已排序
  freeSummary:      string;                  // 免费展示标签
  personalityLabel: string;                  // 性格类型，如"艺术型领导者"
  instrumentVersion?: string;
  normVersion?:     string;
  /** 常模数据来源说明，如 "Zhang et al. Assessment 2021" */
  normSource?:      string | null;
  /** 常模参考样本量，经验常模填真实值，论文常模填 null */
  normSampleSize?:  number | null;
}

export interface IAssessmentSession {
  sessionId:      string;
  openId:         string;
  assessmentType: AssessmentType;
  status:         SessionStatus;
  userProfile:    { gender: Gender; age: number };
  /** 量表版本（如 BFI2_CN_60） */
  instrumentVersion?: string;
  /** 常模版本（如 BFI2_CN_Zhang2021_college_v1） */
  normVersion?: string;
  /** 本次测评的题目顺序（打乱后存储） */
  questionIds: string[];
  answers: {
    index: number;  // session 内题目序号（0-based），不暴露 questionId
    score: number;  // Likert 1-5
  }[];
  result?: IAssessmentResult;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CareerMatchSchema = new Schema<ICareerMatch>(
  {
    code:        { type: String, required: true },
    title:       { type: String, required: true },
    matchScore:  { type: Number, required: true },
    salaryIndex: { type: Number, required: true },
    description: { type: String, default: "" },
  },
  { _id: false }
);

const ResultSchema = new Schema<IAssessmentResult>(
  {
    riasecScores:     { type: Schema.Types.Mixed, default: {} },
    big5Scores:       { type: Schema.Types.Mixed, default: {} },
    big5DomainSum:    { type: Schema.Types.Mixed, default: undefined },
    bfi2FacetMeans:   { type: Schema.Types.Mixed, default: undefined },
    riasecNormalized: { type: Schema.Types.Mixed, default: {} },
    big5Normalized:   { type: Schema.Types.Mixed, default: {} },
    topCareers:       { type: [CareerMatchSchema], default: [] },
    freeSummary:      { type: String, default: "" },
    personalityLabel: { type: String, default: "" },
    instrumentVersion: { type: String, required: false },
    normVersion:      { type: String, required: false },
    normSource:       { type: String, required: false, default: null },
    normSampleSize:   { type: Number, required: false, default: null },
  },
  { _id: false }
);

export const SessionSchema = new Schema<IAssessmentSession>(
  {
    sessionId:      { type: String, required: true, unique: true, index: true },
    openId:         { type: String, required: true, index: true },
    assessmentType: { type: String, enum: ["BFI2", "MBTI", "DISC"], default: "BFI2", index: true },
    status:         { type: String, enum: ["in_progress", "completed", "paid"], default: "in_progress", index: true },
    userProfile: {
      gender: { type: String, enum: ["male", "female"], required: true },
      age:    { type: Number, required: true },
    },
    instrumentVersion: { type: String },
    normVersion:       { type: String },
    questionIds: { type: [String], default: [] },
    answers: [
      {
        index: { type: Number, required: true },
        score: { type: Number, required: true, min: 1, max: 5 },
        _id: false,
      },
    ],
    result: { type: ResultSchema, default: undefined },
    paidAt: { type: Date },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);
