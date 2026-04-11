/**
 * 题库 & 职业常模种子脚本
 * 运行方式：
 *   ENV=development ts-node scripts/seed_begreat.ts
 *   ENV=production  ts-node scripts/seed_begreat.ts
 */
import * as mongoose from "mongoose";
import { randomBytes } from "crypto";
import {
  BFI2_DESCRIPTORS,
  BFI2_REVERSE_ITEMS,
  bfi2DomainForItem,
  bfi2FacetForItem,
  bfi2Stem,
} from "../src/apps/begreat/bfi2/bfi2ItemMeta";

// ── 类型定义（独立于应用，避免依赖初始化）
interface QuestionSeed {
  questionId: string;
  modelType: "RIASEC" | "BIG5";
  dimension: string;
  content: string;
  weight: number;
  gender: "male" | "female";
  isActive: boolean;
  bfiItemNo?: number;
  bfiReverse?: boolean;
  bfiFacet?: string;
}

function buildBfi2Seeds(gender: "male" | "female"): Omit<QuestionSeed, "questionId">[] {
  const out: Omit<QuestionSeed, "questionId">[] = [];
  for (let n = 1; n <= 60; n++) {
    const dim = bfi2DomainForItem(n);
    const facet = bfi2FacetForItem(n);
    if (!dim || !facet) continue;
    out.push({
      modelType: "BIG5",
      dimension: dim,
      content: `${bfi2Stem()} ${n}. ${BFI2_DESCRIPTORS[n - 1]}`,
      weight: 1.0,
      gender,
      isActive: true,
      bfiItemNo: n,
      bfiReverse: BFI2_REVERSE_ITEMS.has(n),
      bfiFacet: facet,
    });
  }
  return out;
}

interface OccupationSeed {
  code: string;
  title: string;
  primaryRiasec: string;
  secondaryRiasec: string;
  requiredBig5: { openness: number; conscientiousness: number; emotionalStability: number };
  salaryIndex: number;
  ageBonusMultiplier: number;
  ageRange: { min: number; max: number };
  description: string;
  isActive: boolean;
}

// ── 题库：RIASEC 情境题 + BFI-2 官方 60 题（男女各一套题干，内容相同）
// RIASEC：1=极不感兴趣 … 5=非常感兴趣；BFI-2：1=非常不同意 … 5=非常同意
const QUESTIONS: Omit<QuestionSeed, "questionId">[] = [

  // ════════════════════════════════════════════════════════════
  // RIASEC-R（实际操作型）
  // ════════════════════════════════════════════════════════════

  // 男版：偏硬件/机械/竞技场景
  { modelType: "RIASEC", dimension: "R", weight: 1.0, gender: "male", isActive: true,
    content: "实验室邀请你独立完成工业机械臂的接线、调参到程序调试全流程，你有多期待这项挑战？" },
  { modelType: "RIASEC", dimension: "R", weight: 1.0, gender: "male", isActive: true,
    content: "无人机竞速赛事需要一名赛场工程师，赛后负责飞行器故障拆解与修复，你愿意加入吗？" },
  { modelType: "RIASEC", dimension: "R", weight: 1.0, gender: "male", isActive: true,
    content: "公司新引进一批电动车底盘测试设备，需要有人系统学习操作规程并培训同事，你会主动请缨吗？" },
  { modelType: "RIASEC", dimension: "R", weight: 1.0, gender: "male", isActive: true,
    content: "数据中心扩容需要人手完成服务器机架安装与网络布线，你对这类动手任务感兴趣吗？" },

  // 女版：偏智能生活/可穿戴/数字制造场景
  { modelType: "RIASEC", dimension: "R", weight: 1.0, gender: "female", isActive: true,
    content: "工作坊提供先进的可编程刺绣机和激光切割设备，邀请你独立完成从设计到成品的全流程，你有多期待？" },
  { modelType: "RIASEC", dimension: "R", weight: 1.0, gender: "female", isActive: true,
    content: "智能家居展览需要一名现场调试专员，负责多品类设备的联动配置与体验演示，你愿意担任吗？" },
  { modelType: "RIASEC", dimension: "R", weight: 1.0, gender: "female", isActive: true,
    content: "团队为你配备了手持 3D 扫描仪用于将实物产品数字化建模，你会主动探索它的各种用途吗？" },
  { modelType: "RIASEC", dimension: "R", weight: 1.0, gender: "female", isActive: true,
    content: "品牌活动需要有人操作 3D 打印机制作定制展品道具，你会主动接手这个任务吗？" },

  // ════════════════════════════════════════════════════════════
  // RIASEC-I（研究探索型）
  // ════════════════════════════════════════════════════════════

  // 男版：偏算法/竞争分析/技术验证场景
  { modelType: "RIASEC", dimension: "I", weight: 1.0, gender: "male", isActive: true,
    content: "竞争对手发布了一款功能异常强大的新产品，你最想做的是深入拆解它的技术逻辑吗？" },
  { modelType: "RIASEC", dimension: "I", weight: 1.0, gender: "male", isActive: true,
    content: "公司推荐系统出现了意外的预测偏差，没有人能解释原因，你会主动申请追查根源吗？" },
  { modelType: "RIASEC", dimension: "I", weight: 1.0, gender: "male", isActive: true,
    content: "你发现一种改进后的排序算法理论上能将搜索响应速度提升 40%，验证需要两周，你愿意投入吗？" },
  { modelType: "RIASEC", dimension: "I", weight: 1.0, gender: "male", isActive: true,
    content: "一份关于「程序员工作效率与代码审查频率关系」的原始数据集摆在你面前，你最想做什么？（1=忽略，5=深挖）" },

  // 女版：偏用户行为/社会数据/健康数据场景
  { modelType: "RIASEC", dimension: "I", weight: 1.0, gender: "female", isActive: true,
    content: "一份「职场女性晋升速度与导师制度关系」的数据集摆在你面前，你最想做什么？（1=直接忽略，5=深入挖掘规律）" },
  { modelType: "RIASEC", dimension: "I", weight: 1.0, gender: "female", isActive: true,
    content: "用户调研数据显示某功能的留存率异常低，但原因不明，你会主动深入分析用户路径吗？" },
  { modelType: "RIASEC", dimension: "I", weight: 1.0, gender: "female", isActive: true,
    content: "你发现健康类 App 用户在特定时段的情绪反馈有规律性波动，你愿意花时间研究其背后原因吗？" },
  { modelType: "RIASEC", dimension: "I", weight: 1.0, gender: "female", isActive: true,
    content: "面对复杂的消费者行为分析任务，你会优先构建研究框架还是直接进行访谈测试？（1=倾向直接测试，5=倾向先建框架）" },

  // ════════════════════════════════════════════════════════════
  // RIASEC-A（艺术创意型）
  // ════════════════════════════════════════════════════════════

  // 男版：偏游戏视觉/科技品牌/概念图场景
  { modelType: "RIASEC", dimension: "A", weight: 1.0, gender: "male", isActive: true,
    content: "一款竞技游戏的整体视觉风格需要重新设计以适配电竞赛事级别的舞台呈现，你愿意主导这个项目吗？" },
  { modelType: "RIASEC", dimension: "A", weight: 1.0, gender: "male", isActive: true,
    content: "科技展览需要你用生成式 AI 工具创作一组未来城市基础设施的概念渲染图，你对此感兴趣吗？" },
  { modelType: "RIASEC", dimension: "A", weight: 1.0, gender: "male", isActive: true,
    content: "有机会独立主导一款硬件产品从包装到 UI 的完整视觉语言设计，你的感受是？" },
  { modelType: "RIASEC", dimension: "A", weight: 1.0, gender: "male", isActive: true,
    content: "公司技术白皮书需要从枯燥数据改写为极具感染力的创意叙事报告，你会主动接手吗？" },

  // 女版：偏时尚/空间/品牌叙事场景
  { modelType: "RIASEC", dimension: "A", weight: 1.0, gender: "female", isActive: true,
    content: "时尚品牌的整体视觉体系需要全面焕新以契合新一代消费者审美，你愿意主导这个项目吗？" },
  { modelType: "RIASEC", dimension: "A", weight: 1.0, gender: "female", isActive: true,
    content: "线上艺术节需要你设计一个具有沉浸感的虚拟展厅空间，你对这类创意任务感兴趣吗？" },
  { modelType: "RIASEC", dimension: "A", weight: 1.0, gender: "female", isActive: true,
    content: "有机会从色调、字体到版式完全自主设计一个生活方式类 App 的视觉风格，你的感受是？" },
  { modelType: "RIASEC", dimension: "A", weight: 1.0, gender: "female", isActive: true,
    content: "品牌需要一篇能引发情感共鸣、打动目标用户的创意主题文案，你会主动承担撰写任务吗？" },

  // ════════════════════════════════════════════════════════════
  // RIASEC-S（社会服务型）
  // ════════════════════════════════════════════════════════════

  // 男版：偏技术带教/冲突调解/用户访谈场景
  { modelType: "RIASEC", dimension: "S", weight: 1.0, gender: "male", isActive: true,
    content: "新来的工程师对整套开发协作工具链完全陌生，你会主动花时间带他们系统上手吗？" },
  { modelType: "RIASEC", dimension: "S", weight: 1.0, gender: "male", isActive: true,
    content: "两位技术骨干因架构方案分歧产生公开对立，有人找你居中协调，你会积极介入吗？" },
  { modelType: "RIASEC", dimension: "S", weight: 1.0, gender: "male", isActive: true,
    content: "有机会为技术部门设计一套系统性的 AI 工具使用培训计划，你认为这份工作有意义吗？" },
  { modelType: "RIASEC", dimension: "S", weight: 1.0, gender: "male", isActive: true,
    content: "需要你主持一场与 B 端客户高管的深度访谈来验证产品方向，你愿意承担这个角色吗？" },

  // 女版：偏融合带教/情感协调/社群访谈场景
  { modelType: "RIASEC", dimension: "S", weight: 1.0, gender: "female", isActive: true,
    content: "新入职的同事对公司文化和远程协作方式感到迷茫，你会主动陪伴她们度过融入期吗？" },
  { modelType: "RIASEC", dimension: "S", weight: 1.0, gender: "female", isActive: true,
    content: "团队因工作分配不均引发情绪积压，有人私下找你倾诉，你会主动推动问题公开解决吗？" },
  { modelType: "RIASEC", dimension: "S", weight: 1.0, gender: "female", isActive: true,
    content: "有机会设计一套帮助新妈妈重返职场的支持体系，你觉得参与这项工作有意义吗？" },
  { modelType: "RIASEC", dimension: "S", weight: 1.0, gender: "female", isActive: true,
    content: "需要你主持一场针对女性用户的产品体验焦点小组访谈，你愿意主导这个过程吗？" },

  // ════════════════════════════════════════════════════════════
  // RIASEC-E（进取领导型）
  // ════════════════════════════════════════════════════════════

  // 男版：偏商业机会/投融资/竞争性领导场景
  { modelType: "RIASEC", dimension: "E", weight: 1.0, gender: "male", isActive: true,
    content: "你发现公司在某个快速增长的细分市场存在先发优势但无人行动，你会主动站出来推进吗？" },
  { modelType: "RIASEC", dimension: "E", weight: 1.0, gender: "male", isActive: true,
    content: "投资人评审会议上团队汇报陷入僵局，你最可能主动接管发言权、扭转局面吗？" },
  { modelType: "RIASEC", dimension: "E", weight: 1.0, gender: "male", isActive: true,
    content: "你被任命负责主导公司最大规模的数字化转型项目，需要协调 5 个部门，你的感受是？（1=有些抵触，5=充满期待）" },
  { modelType: "RIASEC", dimension: "E", weight: 1.0, gender: "male", isActive: true,
    content: "有机会代表公司向顶级 VC 独立完成新业务方向的融资路演，你愿意主导这次演讲吗？" },

  // 女版：偏社会影响力/团队凝聚/倡导型领导场景
  { modelType: "RIASEC", dimension: "E", weight: 1.0, gender: "female", isActive: true,
    content: "你注意到公司在推动女性领导力发展方面存在明显空白，你会主动发起改变吗？" },
  { modelType: "RIASEC", dimension: "E", weight: 1.0, gender: "female", isActive: true,
    content: "跨部门视频会议中各方意见严重分歧、陷入停滞，你最可能主动整合各方立场、推动共识吗？" },
  { modelType: "RIASEC", dimension: "E", weight: 1.0, gender: "female", isActive: true,
    content: "你被提名主导一个面向社区的公益科技项目，需要对外募资和协调志愿者团队，你的感受是？" },
  { modelType: "RIASEC", dimension: "E", weight: 1.0, gender: "female", isActive: true,
    content: "有机会向潜在战略合作伙伴独立展示你团队的社会影响力报告和合作愿景，你愿意主导吗？" },

  // ════════════════════════════════════════════════════════════
  // RIASEC-C（系统规范型）
  // ════════════════════════════════════════════════════════════

  // 男版：偏技术规范/财务系统/数据报表场景
  { modelType: "RIASEC", dimension: "C", weight: 1.0, gender: "male", isActive: true,
    content: "公司要求制定一套覆盖所有研发工具的安全使用规范手册，含版本控制与权限管理，你愿意主导吗？" },
  { modelType: "RIASEC", dimension: "C", weight: 1.0, gender: "male", isActive: true,
    content: "ERP 系统迁移需要整理五年历史交易数据并建立新的科目分类标准，你觉得这类工作有价值吗？" },
  { modelType: "RIASEC", dimension: "C", weight: 1.0, gender: "male", isActive: true,
    content: "技术团队的项目管理极度混乱，你有机会从零梳理所有任务优先级和里程碑，你会主动承担吗？" },
  { modelType: "RIASEC", dimension: "C", weight: 1.0, gender: "male", isActive: true,
    content: "每月汇总并分析全球远程团队的工时、交付质量与代码提交数据，你觉得这份工作令你满意吗？" },

  // 女版：偏协作规范/HR体系/客户追踪场景
  { modelType: "RIASEC", dimension: "C", weight: 1.0, gender: "female", isActive: true,
    content: "团队远程协作缺乏统一规范，你有机会制定从会议礼仪到文件命名的完整行为准则，你愿意主导吗？" },
  { modelType: "RIASEC", dimension: "C", weight: 1.0, gender: "female", isActive: true,
    content: "HR 系统升级需要将所有员工档案按新标准重新归类整理，你觉得做好这件事很有价值吗？" },
  { modelType: "RIASEC", dimension: "C", weight: 1.0, gender: "female", isActive: true,
    content: "跨团队信息流转混乱导致重复劳动，你有机会重新设计信息传递规范与审批流程，你会主动接手吗？" },
  { modelType: "RIASEC", dimension: "C", weight: 1.0, gender: "female", isActive: true,
    content: "每月建立并维护客户满意度追踪体系、输出结构化分析报告，你觉得这类细致工作令你满意吗？" },

  // ════════════════════════════════════════════════════════════
  // BFI-2 中文版 60 题 × 2（男/女题库一致，便于沿用 gender 查询）
  // ════════════════════════════════════════════════════════════
  ...buildBfi2Seeds("male"),
  ...buildBfi2Seeds("female"),
];

// ── 职业常模（requiredBig5 为 BFI-2 领域 Z 分阈值，2026 按新常模重标定）
const OCCUPATIONS: OccupationSeed[] = [
  {
    code: "OCC001", title: "AI 创意总监",
    primaryRiasec: "A", secondaryRiasec: "E",
    requiredBig5: { openness: 0.36, conscientiousness: 0, emotionalStability: 0 },
    salaryIndex: 0.9, ageBonusMultiplier: 1.1,
    ageRange: { min: 25, max: 50 },
    description: "主导品牌创意战略，将生成式 AI 工具融入内容生产流程，驱动营销叙事创新。",
    isActive: true,
  },
  {
    code: "OCC002", title: "数据科学家",
    primaryRiasec: "I", secondaryRiasec: "R",
    requiredBig5: { openness: 0.23, conscientiousness: 0.23, emotionalStability: 0 },
    salaryIndex: 0.95, ageBonusMultiplier: 1.0,
    ageRange: { min: 22, max: 45 },
    description: "构建预测模型和推荐系统，将复杂业务问题转化为可解的数学结构。",
    isActive: true,
  },
  {
    code: "OCC003", title: "用户体验研究员",
    primaryRiasec: "I", secondaryRiasec: "S",
    requiredBig5: { openness: 0.14, conscientiousness: 0.14, emotionalStability: 0 },
    salaryIndex: 0.75, ageBonusMultiplier: 1.0,
    ageRange: { min: 22, max: 50 },
    description: "通过用户访谈、眼动追踪与行为数据分析，挖掘产品体验的改进空间。",
    isActive: true,
  },
  {
    code: "OCC004", title: "远程团队运营专家",
    primaryRiasec: "S", secondaryRiasec: "E",
    requiredBig5: { openness: 0.1, conscientiousness: 0.23, emotionalStability: 0.14 },
    salaryIndex: 0.65, ageBonusMultiplier: 1.05,
    ageRange: { min: 25, max: 50 },
    description: "设计跨时区异步协作流程，维系分布式团队的凝聚力与高效产出。",
    isActive: true,
  },
  {
    code: "OCC005", title: "AI 产品经理",
    primaryRiasec: "E", secondaryRiasec: "I",
    requiredBig5: { openness: 0.27, conscientiousness: 0.18, emotionalStability: 0.1 },
    salaryIndex: 0.92, ageBonusMultiplier: 1.1,
    ageRange: { min: 25, max: 45 },
    description: "定义 AI 功能边界，协调算法、设计与业务三方，将技术潜力转化为产品价值。",
    isActive: true,
  },
  {
    code: "OCC006", title: "无人机系统工程师",
    primaryRiasec: "R", secondaryRiasec: "I",
    requiredBig5: { openness: 0.18, conscientiousness: 0.32, emotionalStability: 0.18 },
    salaryIndex: 0.85, ageBonusMultiplier: 1.0,
    ageRange: { min: 22, max: 45 },
    description: "设计并维护自主飞行系统，涵盖硬件集成、飞控软件开发与外场测试。",
    isActive: true,
  },
  {
    code: "OCC007", title: "数字内容创作者",
    primaryRiasec: "A", secondaryRiasec: "S",
    requiredBig5: { openness: 0.32, conscientiousness: 0.1, emotionalStability: 0 },
    salaryIndex: 0.6, ageBonusMultiplier: 1.15,
    ageRange: { min: 18, max: 40 },
    description: "运营短视频、播客或图文账号，以人格化叙事吸引并留住垂直领域受众。",
    isActive: true,
  },
  {
    code: "OCC008", title: "数据合规专员",
    primaryRiasec: "C", secondaryRiasec: "I",
    requiredBig5: { openness: 0.05, conscientiousness: 0.36, emotionalStability: 0.23 },
    salaryIndex: 0.7, ageBonusMultiplier: 1.05,
    ageRange: { min: 25, max: 55 },
    description: "确保企业数据处理符合 GDPR、个保法等监管要求，降低合规风险。",
    isActive: true,
  },
  {
    code: "OCC009", title: "创业企业顾问",
    primaryRiasec: "E", secondaryRiasec: "C",
    requiredBig5: { openness: 0.23, conscientiousness: 0.27, emotionalStability: 0.23 },
    salaryIndex: 0.88, ageBonusMultiplier: 0.95,
    ageRange: { min: 30, max: 60 },
    description: "为早期创业团队提供商业模式验证、融资策略和团队组建方面的专业指导。",
    isActive: true,
  },
  {
    code: "OCC010", title: "元宇宙架构师",
    primaryRiasec: "I", secondaryRiasec: "R",
    requiredBig5: { openness: 0.41, conscientiousness: 0.27, emotionalStability: 0.1 },
    salaryIndex: 0.97, ageBonusMultiplier: 1.2,
    ageRange: { min: 22, max: 40 },
    description: "设计虚实融合的沉浸式数字空间，整合 XR 硬件、实时渲染与社交协议层。",
    isActive: true,
  },
  {
    code: "OCC011", title: "人机协作培训师",
    primaryRiasec: "S", secondaryRiasec: "I",
    requiredBig5: { openness: 0.23, conscientiousness: 0.18, emotionalStability: 0.14 },
    salaryIndex: 0.68, ageBonusMultiplier: 1.05,
    ageRange: { min: 25, max: 55 },
    description: "帮助职场人士建立与 AI 协同的工作习惯，提升人机协作效能。",
    isActive: true,
  },
  {
    code: "OCC012", title: "可持续发展分析师",
    primaryRiasec: "I", secondaryRiasec: "C",
    requiredBig5: { openness: 0.18, conscientiousness: 0.32, emotionalStability: 0.14 },
    salaryIndex: 0.72, ageBonusMultiplier: 1.1,
    ageRange: { min: 23, max: 50 },
    description: "量化企业碳足迹，构建 ESG 评估模型，支持绿色转型决策。",
    isActive: true,
  },
  {
    code: "OCC013", title: "创意写作 AI 训练师",
    primaryRiasec: "A", secondaryRiasec: "I",
    requiredBig5: { openness: 0.36, conscientiousness: 0.23, emotionalStability: 0 },
    salaryIndex: 0.78, ageBonusMultiplier: 1.15,
    ageRange: { min: 20, max: 45 },
    description: "通过人工标注和偏好反馈，提升大语言模型在创意写作任务上的表现质量。",
    isActive: true,
  },
  {
    code: "OCC014", title: "远程医疗协调员",
    primaryRiasec: "S", secondaryRiasec: "C",
    requiredBig5: { openness: 0.1, conscientiousness: 0.32, emotionalStability: 0.27 },
    salaryIndex: 0.73, ageBonusMultiplier: 1.0,
    ageRange: { min: 22, max: 55 },
    description: "协调线上诊疗流程，确保患者在数字化医疗路径中获得连贯、安全的就医体验。",
    isActive: true,
  },
  {
    code: "OCC015", title: "智能仓储机器人操作员",
    primaryRiasec: "R", secondaryRiasec: "C",
    requiredBig5: { openness: 0.05, conscientiousness: 0.36, emotionalStability: 0.23 },
    salaryIndex: 0.55, ageBonusMultiplier: 1.0,
    ageRange: { min: 18, max: 50 },
    description: "监控和维护自动化仓储机器人系统，处理异常任务调度和设备故障报告。",
    isActive: true,
  },
];

// ── 数据库连接与插入
async function seed() {
  const env = process.env.ENV ?? process.env.environment ?? "development";
  const configPath = `${__dirname}/../src/apps/begreat/sysconfig/${env}/db_config.json`;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbCfg = (require(configPath) as { db_global: { host: string; port: number; db: string; user?: string; password?: string; authSource?: string } }).db_global;

  const auth = dbCfg.user ? `${dbCfg.user}:${dbCfg.password}@` : "";
  const authSrc = dbCfg.authSource ? `?authSource=${dbCfg.authSource}` : "";
  const url = `mongodb://${auth}${dbCfg.host}:${dbCfg.port}/${dbCfg.db}${authSrc}`;

  console.log(`Connecting to ${dbCfg.host}:${dbCfg.port}/${dbCfg.db} ...`);
  await mongoose.connect(url);
  console.log("Connected.");

  const db = mongoose.connection.db;
  if (!db) throw new Error("No DB connection");

  // ── 插入题库
  const qColl = db.collection("questions");
  await qColl.deleteMany({});
  const questions: QuestionSeed[] = QUESTIONS.map((q) => ({
    ...q,
    questionId: randomBytes(8).toString("hex"),
  }));
  await qColl.insertMany(questions);

  // 统计分布
  const maleCount   = questions.filter(q => q.gender === "male").length;
  const femaleCount = questions.filter(q => q.gender === "female").length;
  console.log(`Inserted ${questions.length} questions (male: ${maleCount}, female: ${femaleCount}).`);

  // ── 插入职业常模
  const oColl = db.collection("occupationnorms");
  await oColl.deleteMany({});
  await oColl.insertMany(OCCUPATIONS);
  console.log(`Inserted ${OCCUPATIONS.length} occupation norms.`);

  await mongoose.disconnect();
  console.log("Done.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
