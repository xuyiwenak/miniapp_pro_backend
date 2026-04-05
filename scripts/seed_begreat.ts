/**
 * 题库 & 职业常模种子脚本
 * 运行方式：
 *   ENV=development ts-node scripts/seed_begreat.ts
 *   ENV=production  ts-node scripts/seed_begreat.ts
 */
import * as mongoose from "mongoose";
import { randomBytes } from "crypto";

// ── 类型定义（独立于应用，避免依赖初始化）
interface QuestionSeed {
  questionId: string;
  modelType: "RIASEC" | "BIG5";
  dimension: string;
  content: string;
  weight: number;
  isActive: boolean;
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

// ── 题库（44题，全部原创，不引用任何官方版权内容）
// 量表：1=完全不符合/极不感兴趣，5=完全符合/非常感兴趣
const QUESTIONS: Omit<QuestionSeed, "questionId">[] = [
  // ── RIASEC-R（实际操作型）
  { modelType: "RIASEC", dimension: "R", weight: 1.0, isActive: true, content: "某智能制造实验室邀请你用编程控制机械臂组装零件，这让你感到？" },
  { modelType: "RIASEC", dimension: "R", weight: 1.0, isActive: true, content: "一场无人机竞速赛事需要维修团队，负责赛后飞行器故障排查与修复，你愿意加入吗？" },
  { modelType: "RIASEC", dimension: "R", weight: 1.0, isActive: true, content: "公司为你配备了工业 AR 眼镜用于指导设备安装和故障排查，你最可能会如何使用它？（1=尽量回避，5=主动探索）" },
  { modelType: "RIASEC", dimension: "R", weight: 1.0, isActive: true, content: "团队需要有人学习操作 3D 打印机制作产品原型，你会主动承担这个任务吗？" },

  // ── RIASEC-I（研究探索型）
  { modelType: "RIASEC", dimension: "I", weight: 1.0, isActive: true, content: "一份「远程办公对创意型员工效率影响」的数据集摆在你面前，你最想做什么？（1=直接忽略，5=深入挖掘规律）" },
  { modelType: "RIASEC", dimension: "I", weight: 1.0, isActive: true, content: "公司 AI 系统给出了意外预测结果，没人能解释，你会主动追查原因吗？" },
  { modelType: "RIASEC", dimension: "I", weight: 1.0, isActive: true, content: "你发现一种新算法可能让搜索效率提升 30%，但需要大量时间验证，你愿意投入吗？" },
  { modelType: "RIASEC", dimension: "I", weight: 1.0, isActive: true, content: "面对复杂的用户行为分析任务，你会首先拆解数据框架还是直接动手测试？（1=倾向直接测试，5=倾向先建框架）" },

  // ── RIASEC-A（艺术创意型）
  { modelType: "RIASEC", dimension: "A", weight: 1.0, isActive: true, content: "公司品牌视觉需全面重新设计以适应 AI 时代审美，你愿意主导这个项目吗？" },
  { modelType: "RIASEC", dimension: "A", weight: 1.0, isActive: true, content: "一个虚拟展览需要你用生成式 AI 工具创作概念图，你对这个任务感兴趣吗？" },
  { modelType: "RIASEC", dimension: "A", weight: 1.0, isActive: true, content: "有机会从色彩到排版完全主导一款新应用的界面设计，你的感受是？" },
  { modelType: "RIASEC", dimension: "A", weight: 1.0, isActive: true, content: "团队需要人撰写公司年度报告的创意叙事文案，你会主动接手吗？" },

  // ── RIASEC-S（社会服务型）
  { modelType: "RIASEC", dimension: "S", weight: 1.0, isActive: true, content: "新来的实习生对远程协作工具完全不熟悉，你会主动带他们上手吗？" },
  { modelType: "RIASEC", dimension: "S", weight: 1.0, isActive: true, content: "团队成员因工作方式分歧产生矛盾，有人找你调解，你会积极参与吗？" },
  { modelType: "RIASEC", dimension: "S", weight: 1.0, isActive: true, content: "有机会为公司设计一套 AI 工具使用培训方案，你觉得这份工作有意义吗？" },
  { modelType: "RIASEC", dimension: "S", weight: 1.0, isActive: true, content: "需要组织用户焦点小组访谈来收集产品反馈，你愿意主持这个过程吗？" },

  // ── RIASEC-E（进取领导型）
  { modelType: "RIASEC", dimension: "E", weight: 1.0, isActive: true, content: "你发现公司在某个 AI 赋能新市场有巨大机会但无人推动，你会站出来吗？" },
  { modelType: "RIASEC", dimension: "E", weight: 1.0, isActive: true, content: "远程团队会议陷入僵局，你最可能主动打破沉默、推进讨论吗？" },
  { modelType: "RIASEC", dimension: "E", weight: 1.0, isActive: true, content: "你被提名负责一个跨部门数字化转型项目，你的感受是？（1=有些抵触，5=充满期待）" },
  { modelType: "RIASEC", dimension: "E", weight: 1.0, isActive: true, content: "有机会向投资人展示团队的新业务方向，你愿意主导这次路演吗？" },

  // ── RIASEC-C（系统规范型）
  { modelType: "RIASEC", dimension: "C", weight: 1.0, isActive: true, content: "公司要求制定一套 AI 工具使用规范手册，包含所有操作流程，你愿意主导这项工作吗？" },
  { modelType: "RIASEC", dimension: "C", weight: 1.0, isActive: true, content: "财务系统升级需要整理历史数据并建立新分类标准，你觉得这类任务有价值吗？" },
  { modelType: "RIASEC", dimension: "C", weight: 1.0, isActive: true, content: "团队项目管理混乱，你有机会重新梳理所有任务和截止日期，你会主动承担吗？" },
  { modelType: "RIASEC", dimension: "C", weight: 1.0, isActive: true, content: "每月整理并分析远程团队的工作量报表，你觉得这份工作令你满意吗？" },

  // ── BIG5-O（开放性）
  { modelType: "BIG5", dimension: "O", weight: 1.0, isActive: true, content: "当你遇到从未使用过的 AI 工具时，你的第一反应是立刻尝试吗？" },
  { modelType: "BIG5", dimension: "O", weight: 1.0, isActive: true, content: "同事提出完全颠覆传统工作流程的新方案，你倾向于支持探索吗？" },
  { modelType: "BIG5", dimension: "O", weight: 1.0, isActive: true, content: "你是否经常主动思考某个行业在 10 年内可能发生的根本性变化？" },
  { modelType: "BIG5", dimension: "O", weight: 1.0, isActive: true, content: "面对量子计算等抽象技术概念，你会感到好奇并主动学习吗？" },

  // ── BIG5-C（尽责性）
  { modelType: "BIG5", dimension: "C", weight: 1.0, isActive: true, content: "在远程办公、无人监督的环境下，你依然能保持高效的工作状态吗？" },
  { modelType: "BIG5", dimension: "C", weight: 1.0, isActive: true, content: "接手细节繁多的长期项目时，你会第一步就制定详细计划吗？" },
  { modelType: "BIG5", dimension: "C", weight: 1.0, isActive: true, content: "项目还剩两周、进度已达 80% 时，你会维持高强度推进直到完成吗？" },
  { modelType: "BIG5", dimension: "C", weight: 1.0, isActive: true, content: "你在某任务中发现了一个小错误，修复它需要额外 3 小时，你会立刻处理吗？" },

  // ── BIG5-E（外向性）
  { modelType: "BIG5", dimension: "E", weight: 1.0, isActive: true, content: "一个需要持续与 10+ 客户沟通的新项目找到你，你感到精力充沛吗？" },
  { modelType: "BIG5", dimension: "E", weight: 1.0, isActive: true, content: "公司组织线下行业交流活动，你通常会主动拓展新联系吗？" },
  { modelType: "BIG5", dimension: "E", weight: 1.0, isActive: true, content: "在陌生线上会议中主持人突然请你发言，你能轻松应对吗？" },
  { modelType: "BIG5", dimension: "E", weight: 1.0, isActive: true, content: "午休时间你更倾向于和同事交流，还是独处充电？（1=明显倾向独处，5=明显倾向交流）" },

  // ── BIG5-A（宜人性）
  { modelType: "BIG5", dimension: "A", weight: 1.0, isActive: true, content: "同事的方案有明显缺陷但他非常投入，你在会议上会温和地提出改进建议吗？" },
  { modelType: "BIG5", dimension: "A", weight: 1.0, isActive: true, content: "你发现团队某成员工作压力极大，虽不在你职责范围，你会主动提供支持吗？" },
  { modelType: "BIG5", dimension: "A", weight: 1.0, isActive: true, content: "你的意见与团队多数人不同时，你倾向于为和谐而妥协吗？" },
  { modelType: "BIG5", dimension: "A", weight: 1.0, isActive: true, content: "合作客户提出你认为不合理的要求，你会优先考虑维护关系吗？" },

  // ── BIG5-N（情绪稳定性，高分=高神经质=低稳定）
  { modelType: "BIG5", dimension: "N", weight: 1.0, isActive: true, content: "项目出现重大变更、所有计划需重来时，你会感到强烈焦虑吗？" },
  { modelType: "BIG5", dimension: "N", weight: 1.0, isActive: true, content: "连续两周高强度工作压力下，你通常很难保持情绪平稳吗？" },
  { modelType: "BIG5", dimension: "N", weight: 1.0, isActive: true, content: "工作中犯了影响较大的错误后，你会反复自责很长时间吗？" },
  { modelType: "BIG5", dimension: "N", weight: 1.0, isActive: true, content: "面对频繁变更的需求和工作中的不确定性，你会感到明显不适吗？" },
];

// ── 职业常模（15 个 2026 年职业，全原创描述）
const OCCUPATIONS: OccupationSeed[] = [
  {
    code: "OCC001", title: "AI 创意总监",
    primaryRiasec: "A", secondaryRiasec: "E",
    requiredBig5: { openness: 0.8, conscientiousness: 0, emotionalStability: 0 },
    salaryIndex: 0.9, ageBonusMultiplier: 1.1,
    ageRange: { min: 25, max: 50 },
    description: "主导品牌创意战略，将生成式 AI 工具融入内容生产流程，驱动营销叙事创新。",
    isActive: true,
  },
  {
    code: "OCC002", title: "数据科学家",
    primaryRiasec: "I", secondaryRiasec: "R",
    requiredBig5: { openness: 0.5, conscientiousness: 0.5, emotionalStability: 0 },
    salaryIndex: 0.95, ageBonusMultiplier: 1.0,
    ageRange: { min: 22, max: 45 },
    description: "构建预测模型和推荐系统，将复杂业务问题转化为可解的数学结构。",
    isActive: true,
  },
  {
    code: "OCC003", title: "用户体验研究员",
    primaryRiasec: "I", secondaryRiasec: "S",
    requiredBig5: { openness: 0.3, conscientiousness: 0.3, emotionalStability: 0 },
    salaryIndex: 0.75, ageBonusMultiplier: 1.0,
    ageRange: { min: 22, max: 50 },
    description: "通过用户访谈、眼动追踪与行为数据分析，挖掘产品体验的改进空间。",
    isActive: true,
  },
  {
    code: "OCC004", title: "远程团队运营专家",
    primaryRiasec: "S", secondaryRiasec: "E",
    requiredBig5: { openness: 0.2, conscientiousness: 0.5, emotionalStability: 0.3 },
    salaryIndex: 0.65, ageBonusMultiplier: 1.05,
    ageRange: { min: 25, max: 50 },
    description: "设计跨时区异步协作流程，维系分布式团队的凝聚力与高效产出。",
    isActive: true,
  },
  {
    code: "OCC005", title: "AI 产品经理",
    primaryRiasec: "E", secondaryRiasec: "I",
    requiredBig5: { openness: 0.6, conscientiousness: 0.4, emotionalStability: 0.2 },
    salaryIndex: 0.92, ageBonusMultiplier: 1.1,
    ageRange: { min: 25, max: 45 },
    description: "定义 AI 功能边界，协调算法、设计与业务三方，将技术潜力转化为产品价值。",
    isActive: true,
  },
  {
    code: "OCC006", title: "无人机系统工程师",
    primaryRiasec: "R", secondaryRiasec: "I",
    requiredBig5: { openness: 0.4, conscientiousness: 0.7, emotionalStability: 0.4 },
    salaryIndex: 0.85, ageBonusMultiplier: 1.0,
    ageRange: { min: 22, max: 45 },
    description: "设计并维护自主飞行系统，涵盖硬件集成、飞控软件开发与外场测试。",
    isActive: true,
  },
  {
    code: "OCC007", title: "数字内容创作者",
    primaryRiasec: "A", secondaryRiasec: "S",
    requiredBig5: { openness: 0.7, conscientiousness: 0.2, emotionalStability: 0 },
    salaryIndex: 0.6, ageBonusMultiplier: 1.15,
    ageRange: { min: 18, max: 40 },
    description: "运营短视频、播客或图文账号，以人格化叙事吸引并留住垂直领域受众。",
    isActive: true,
  },
  {
    code: "OCC008", title: "数据合规专员",
    primaryRiasec: "C", secondaryRiasec: "I",
    requiredBig5: { openness: 0.1, conscientiousness: 0.8, emotionalStability: 0.5 },
    salaryIndex: 0.7, ageBonusMultiplier: 1.05,
    ageRange: { min: 25, max: 55 },
    description: "确保企业数据处理符合 GDPR、个保法等监管要求，降低合规风险。",
    isActive: true,
  },
  {
    code: "OCC009", title: "创业企业顾问",
    primaryRiasec: "E", secondaryRiasec: "C",
    requiredBig5: { openness: 0.5, conscientiousness: 0.6, emotionalStability: 0.5 },
    salaryIndex: 0.88, ageBonusMultiplier: 0.95,
    ageRange: { min: 30, max: 60 },
    description: "为早期创业团队提供商业模式验证、融资策略和团队组建方面的专业指导。",
    isActive: true,
  },
  {
    code: "OCC010", title: "元宇宙架构师",
    primaryRiasec: "I", secondaryRiasec: "R",
    requiredBig5: { openness: 0.9, conscientiousness: 0.6, emotionalStability: 0.2 },
    salaryIndex: 0.97, ageBonusMultiplier: 1.2,
    ageRange: { min: 22, max: 40 },
    description: "设计虚实融合的沉浸式数字空间，整合 XR 硬件、实时渲染与社交协议层。",
    isActive: true,
  },
  {
    code: "OCC011", title: "人机协作培训师",
    primaryRiasec: "S", secondaryRiasec: "I",
    requiredBig5: { openness: 0.5, conscientiousness: 0.4, emotionalStability: 0.3 },
    salaryIndex: 0.68, ageBonusMultiplier: 1.05,
    ageRange: { min: 25, max: 55 },
    description: "帮助职场人士建立与 AI 协同的工作习惯，提升人机协作效能。",
    isActive: true,
  },
  {
    code: "OCC012", title: "可持续发展分析师",
    primaryRiasec: "I", secondaryRiasec: "C",
    requiredBig5: { openness: 0.4, conscientiousness: 0.7, emotionalStability: 0.3 },
    salaryIndex: 0.72, ageBonusMultiplier: 1.1,
    ageRange: { min: 23, max: 50 },
    description: "量化企业碳足迹，构建 ESG 评估模型，支持绿色转型决策。",
    isActive: true,
  },
  {
    code: "OCC013", title: "创意写作 AI 训练师",
    primaryRiasec: "A", secondaryRiasec: "I",
    requiredBig5: { openness: 0.8, conscientiousness: 0.5, emotionalStability: 0 },
    salaryIndex: 0.78, ageBonusMultiplier: 1.15,
    ageRange: { min: 20, max: 45 },
    description: "通过人工标注和偏好反馈，提升大语言模型在创意写作任务上的表现质量。",
    isActive: true,
  },
  {
    code: "OCC014", title: "远程医疗协调员",
    primaryRiasec: "S", secondaryRiasec: "C",
    requiredBig5: { openness: 0.2, conscientiousness: 0.7, emotionalStability: 0.6 },
    salaryIndex: 0.73, ageBonusMultiplier: 1.0,
    ageRange: { min: 22, max: 55 },
    description: "协调线上诊疗流程，确保患者在数字化医疗路径中获得连贯、安全的就医体验。",
    isActive: true,
  },
  {
    code: "OCC015", title: "智能仓储机器人操作员",
    primaryRiasec: "R", secondaryRiasec: "C",
    requiredBig5: { openness: 0.1, conscientiousness: 0.8, emotionalStability: 0.5 },
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
  console.log(`Inserted ${questions.length} questions.`);

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
