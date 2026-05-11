import { Schema } from 'mongoose';
import type { IReportSnapshot } from './reportResult.entity';

export type SessionStatus = 'in_progress' | 'completed' | 'invite_unlocked' | 'paid';
export type Gender = 'male' | 'female';
export type AssessmentType = 'BFI2' | 'BFI2_FREE' | 'MBTI' | 'DISC';

export interface ICareerMatch {
  code: string;
  title: string;
  matchScore: number;
  salaryIndex: number;
  description: string;
  /** 行业分类 */
  industry?: { primary: string; secondary: string };
  /** 职业阶段 */
  level?: 'entry' | 'mid' | 'senior';
  /** 薪资区间 */
  salary?: { min: number; max: number; unit: 'month' | 'year' };
  /** 所需技能 */
  skills?: { required: string[]; tools: string[] };
  /** AI 替代风险 0–1 */
  aiRisk?: number;
  /** 职业专属 AI 应对建议（来自 occupation.aiImpactAdvice） */
  aiImpactAdvice?: string;
  /** 各年龄段原始说明（来自 occupation，供报告模板渲染使用） */
  ageHints?: Partial<Record<string, string>>;
  /** 各维度贡献拆解（单位：分） */
  scoreBreakdown?: {
    openness: number;
    conscientiousness: number;
    emotionalStability: number;
    ageMultiplier: number;
    softPenaltyMultiplier?: number;
  };
  /** 命中的不推荐规则信息（仅用于解释） */
  ruleAdjustments?: {
    softHitIds?: string[];
    softHitReasons?: string[];
    advice?: string;
  };
}

export interface IExcludedCareer {
  code: string;
  title: string;
  reasons: string[];
  ruleIds: string[];
  advice?: string;
}

export interface ISoftAdjustedCareer {
  code: string;
  title: string;
  matchScore: number;
  softPenaltyMultiplier: number;
  reasons: string[];
  ruleIds: string[];
  advice?: string;
}

export interface IAssessmentResult {
  /** BFI-2 五领域均分（1–5，已反向计分） */
  big5Scores:      Record<string, number>;
  /** 各域 12 题 raw 分和（12–60，已反向） */
  big5DomainSum?:  Record<string, number>;
  /** BFI-2 十五子维度均分（1–5） */
  bfi2FacetMeans?: Record<string, number>;
  big5Normalized:  Record<string, number>;
  topCareers:       ICareerMatch[];          // 匹配职业，已排序
  excludedCareers?: IExcludedCareer[];       // 兼容字段：被 hard 规则过滤的职业（含原因）
  hardExcluded?:    IExcludedCareer[];       // 新字段：hard 规则命中列表
  softAdjusted?:    ISoftAdjustedCareer[];   // 新字段：soft 规则命中列表（已降权）
  freeSummary:      string;                  // 免费展示标签
  personalityLabel: string;                  // 性格类型，如"艺术型领导者"
  instrumentVersion?: string;
  normVersion?:     string;
  /** 常模数据来源说明，如 "Zhang et al. Assessment 2021" */
  normSource?:      string | null;
  /** 常模参考样本量，经验常模填真实值，论文常模填 null */
  normSampleSize?:  number | null;
  /** BFI-2 模板化报告（封面句、五维解读、摘要句等） */
  report?: IReportSnapshot;
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
  /** 邀请人 openId（由邀请码反查写入，start 时记录） */
  referrerId?: string;
  /** 是否已结算邀请积分（幂等标志） */
  referrerCredited?: boolean;
  /** 邀请解锁时间 */
  inviteUnlockedAt?: Date;
  paidAt?: Date;
  /** 管理员赠送解锁标记（用于内测、合作伙伴等场景） */
  grantedByAdmin?: boolean;
  /** 赠送原因/备注 */
  grantReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CareerMatchSchema = new Schema<ICareerMatch>(
  {
    code:        { type: String, required: true },
    title:       { type: String, required: true },
    matchScore:  { type: Number, required: true },
    salaryIndex: { type: Number, required: true },
    description: { type: String, default: '' },
    industry:    { type: Schema.Types.Mixed },
    level:       { type: String, enum: ['entry', 'mid', 'senior'] },
    salary:      { type: Schema.Types.Mixed },
    skills:      { type: Schema.Types.Mixed },
    aiRisk:         { type: Number },
    aiImpactAdvice: { type: String },
    ageHints:       { type: Schema.Types.Mixed },
    scoreBreakdown: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const ResultSchema = new Schema<IAssessmentResult>(
  {
    big5Scores:    { type: Schema.Types.Mixed, default: {} },
    big5DomainSum: { type: Schema.Types.Mixed, default: undefined },
    bfi2FacetMeans:{ type: Schema.Types.Mixed, default: undefined },
    big5Normalized:{ type: Schema.Types.Mixed, default: {} },
    topCareers:       { type: [CareerMatchSchema], default: [] },
    excludedCareers:  { type: [Schema.Types.Mixed], default: [] },
    hardExcluded:     { type: [Schema.Types.Mixed], default: [] },
    softAdjusted:     { type: [Schema.Types.Mixed], default: [] },
    freeSummary:      { type: String, default: '' },
    personalityLabel: { type: String, default: '' },
    instrumentVersion: { type: String, required: false },
    normVersion:      { type: String, required: false },
    normSource:       { type: String, required: false, default: null },
    normSampleSize:   { type: Number, required: false, default: null },
    report:           { type: Schema.Types.Mixed, required: false },
  },
  { _id: false }
);

export const SessionSchema = new Schema<IAssessmentSession>(
  {
    sessionId:      { type: String, required: true, unique: true, index: true },
    openId:         { type: String, required: true, index: true },
    assessmentType: { type: String, enum: ['BFI2', 'BFI2_FREE', 'MBTI', 'DISC'], default: 'BFI2', index: true },
    status:         { type: String, enum: ['in_progress', 'completed', 'invite_unlocked', 'paid'], default: 'in_progress', index: true },
    userProfile: {
      gender: { type: String, enum: ['male', 'female'], required: true },
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
    result:            { type: ResultSchema, default: undefined },
    referrerId:        { type: String, index: true, sparse: true },
    referrerCredited:  { type: Boolean, default: false },
    inviteUnlockedAt:  { type: Date },
    paidAt:            { type: Date },
    grantedByAdmin:    { type: Boolean, default: false, index: true },
    grantReason:       { type: String },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

SessionSchema.index({ openId: 1, status: 1 });
