import { Schema } from "mongoose";

export type SessionStatus = "in_progress" | "completed" | "paid";
export type Gender = "male" | "female";

export interface ICareerMatch {
  code: string;
  title: string;
  matchScore: number;
  salaryIndex: number;
  description: string;
}

export interface IAssessmentResult {
  riasecScores:     Record<string, number>;  // 原始分
  big5Scores:       Record<string, number>;
  riasecNormalized: Record<string, number>;  // Z 分
  big5Normalized:   Record<string, number>;
  topCareers:       ICareerMatch[];          // 匹配职业，已排序
  freeSummary:      string;                  // 免费展示标签
  personalityLabel: string;                  // 性格类型，如"艺术型领导者"
}

export interface IAssessmentSession {
  sessionId:   string;
  openId:      string;
  status:      SessionStatus;
  userProfile: { gender: Gender; age: number };
  /** 本次测评的题目顺序（打乱后存储） */
  questionIds: string[];
  answers: {
    questionId: string;
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
    riasecNormalized: { type: Schema.Types.Mixed, default: {} },
    big5Normalized:   { type: Schema.Types.Mixed, default: {} },
    topCareers:       { type: [CareerMatchSchema], default: [] },
    freeSummary:      { type: String, default: "" },
    personalityLabel: { type: String, default: "" },
  },
  { _id: false }
);

export const SessionSchema = new Schema<IAssessmentSession>(
  {
    sessionId:   { type: String, required: true, unique: true, index: true },
    openId:      { type: String, required: true, index: true },
    status:      { type: String, enum: ["in_progress", "completed", "paid"], default: "in_progress", index: true },
    userProfile: {
      gender: { type: String, enum: ["male", "female"], required: true },
      age:    { type: Number, required: true },
    },
    questionIds: { type: [String], default: [] },
    answers: [
      {
        questionId: { type: String, required: true },
        score:      { type: Number, required: true, min: 1, max: 5 },
        _id: false,
      },
    ],
    result: { type: ResultSchema, default: undefined },
    paidAt: { type: Date },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);
