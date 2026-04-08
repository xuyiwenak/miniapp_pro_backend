/**
 * 生成题库 Excel 模板
 * 运行：ts-node scripts/gen_template.ts
 * 输出：questions_template.xlsx（在项目根目录）
 */
import * as XLSX from "xlsx";
import * as path from "path";

const HEADERS = ["content", "modelType", "dimension", "weight", "gender", "ageMin", "ageMax", "isActive"];

const EXAMPLES = [
  ["某智能制造实验室邀请你用编程控制机械臂，这让你感到？", "RIASEC", "R", 1.0, "both", 0,  999, "TRUE"],
  ["面对复杂数据集，你会主动深入挖掘规律吗？",             "RIASEC", "I", 1.0, "both", 0,  999, "TRUE"],
  ["主导品牌视觉重设计，你感兴趣吗？",                     "RIASEC", "A", 1.0, "female", 18, 40, "TRUE"],
  ["新实习生不熟悉工具，你会主动帮他们上手吗？",           "RIASEC", "S", 1.0, "both", 0,  999, "TRUE"],
  ["你发现公司在新市场有机会但无人推动，你会站出来吗？",   "RIASEC", "E", 1.2, "both", 25, 999, "TRUE"],
  ["制定操作规范手册，你愿意主导这项工作吗？",             "RIASEC", "C", 1.0, "both", 0,  999, "TRUE"],
  ["遇到新 AI 工具，你的第一反应是立刻尝试吗？",           "BIG5",   "O", 1.0, "both", 0,  999, "TRUE"],
  ["远程无监督办公，你依然能保持高效吗？",                  "BIG5",   "C", 1.0, "both", 0,  999, "TRUE"],
  ["需要持续与多个客户沟通，你感到精力充沛吗？",           "BIG5",   "E", 1.0, "both", 0,  999, "TRUE"],
  ["同事方案有缺陷但他很投入，你会温和提出建议吗？",       "BIG5",   "A", 1.0, "both", 0,  999, "TRUE"],
  ["项目重大变更需重来时，你会感到强烈焦虑吗？",           "BIG5",   "N", 1.0, "both", 0,  999, "TRUE"],
];

const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...EXAMPLES]);

// 列宽
ws["!cols"] = [
  { wch: 50 }, // content
  { wch: 10 }, // modelType
  { wch: 12 }, // dimension
  { wch: 8  }, // weight
  { wch: 8  }, // gender
  { wch: 8  }, // ageMin
  { wch: 8  }, // ageMax
  { wch: 10 }, // isActive
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "题库");

const out = path.resolve(__dirname, "../questions_template.xlsx");
XLSX.writeFile(wb, out);
console.log(`模板已生成：${out}`);
