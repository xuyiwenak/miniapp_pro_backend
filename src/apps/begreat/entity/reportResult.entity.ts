import type { ICareerMatch } from "./session.entity";

/**
 * BFI-2 报告快照（由 tpl/report_template.json + 计分结果渲染）
 */
export interface IBig5ReportDimension {
  code: string;
  name: string;
  desc: string;
  zScore: number;
  tScore: number;
  levelKey: string;
  levelName: string;
  levelRange: string;
  interpretation: string;
}

/** AI 冲击分析（每个推荐职业独立输出） */
export interface ICareerAiImpact {
  /** 数值 0–1，来自 occupation.aiRisk */
  risk: number;
  /** 风险等级标签，如"中等替代概率" */
  riskLabel: string;
  /** 风险徽章，如"需主动适应" */
  badge: string;
  /** 风险带通用说明 */
  summary: string;
  /** 风险带通用建议 */
  generalAdvice: string;
  /** 行业 × 风险带 差异化建议（最具参考价值） */
  industryAdvice: string;
}

/** 模板渲染后的职业条目（在 ICareerMatch 基础上加入展示文本） */
export interface IAnnotatedCareerMatch extends ICareerMatch {
  /** 来自 template.careers.industries 的行业名称 */
  industryLabel?: string;
  /** 来自 template.careers.levels 的等级名称，如"中级" */
  levelLabel?: string;
  /** 来自 template.careers.levels 的经验年限说明 */
  levelYears?: string;
  /** 格式化薪资文本，如"15k–30k / 月" */
  salaryText?: string;
  /** 当前年龄段的情境化说明（occupation.ageHints[ageGroup]） */
  ageContextText?: string;
  /** 基于用户 Big5 特质生成的匹配原因（最多两条拼接） */
  matchReason?: string;
  /** AI 时代冲击分析（每职业独立，含概率 + 行业专项建议） */
  aiImpact?: ICareerAiImpact;
}

/** 职业方向区块（模板渲染后的完整结构） */
export interface ICareerSection {
  sectionTitle: string;
  /** 年龄 × 性别差异化引导语 */
  intro: string;
  /** 当前年龄组的职业发展通用建议 */
  ageCareerContext: string;
  careers: IAnnotatedCareerMatch[];
}

export interface IReportSnapshot {
  title: string;
  normDesc: string;
  disclaimer: string;
  coverLine: string;
  normContext: {
    tScoreLine: string;
    fallbackNote: string;
    ageReadingHint: string;
    genderReadingHint: string;
  };
  big5Dimensions: IBig5ReportDimension[];
  summaryLine: string;
  advantageLine: string;
  improveLine: string;
  suggestionLine: string;
  /** 职业方向区块（由 report_template.json careers 区块驱动） */
  careerSection?: ICareerSection;
}
