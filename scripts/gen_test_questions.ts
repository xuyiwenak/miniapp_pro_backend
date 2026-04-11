/**
 * 生成 BFI-2 中文版 60 题题库 Excel（可直接用 import_questions.ts 导入）
 * 运行：ts-node scripts/gen_test_questions.ts
 * 输出：scripts/questions_test.xlsx
 *
 * 列说明：
 *   content     完整题干（"我是一个……的人 N. 描述词"）
 *   modelType   BIG5
 *   dimension   O / C / E / A / N（五大领域）
 *   weight      1.0（全量等权）
 *   gender      both（BFI-2 不分性别）
 *   ageMin      0
 *   ageMax      999
 *   isActive    TRUE
 *   bfiItemNo   官方题号 1–60
 *   bfiReverse  Y / N（反向计分标记）
 *   bfiFacet    子维度键（如 Sociability）
 */
import * as XLSX from "xlsx";
import * as path from "path";

// 60 个描述词（Zhang 等 BFI-2 中文版附录，按题号顺序）
const DESCRIPTORS: string[] = [
  "性格外向，喜欢交际",           // 1  E Sociability
  "心肠柔软，有同情心",           // 2  A Compassion
  "缺乏条理",                     // 3  C Organization  R
  "从容，善于处理压力",           // 4  N Anxiety        R
  "对艺术没有什么兴趣",           // 5  O AestheticSensitivity R
  "性格坚定自信，敢于表达自己的观点", // 6  E Assertiveness
  "为人恭谦，尊重他人",           // 7  A Respectfulness
  "比较懒",                       // 8  C Productiveness  R
  "经历挫折后仍能保持积极心态",   // 9  N Depression      R
  "对许多不同的事物都感兴趣",     // 10 O IntellectualCuriosity
  "很少觉得兴奋或者特别想要(做)什么", // 11 E Energy        R
  "常常挑别人的毛病",             // 12 A Trust           R
  "可信赖的，可靠的",             // 13 C Responsibility
  "喜怒无常，情绪起伏较多",       // 14 N EmotionalVolatility
  "善于创造，能找到聪明的方法来做事", // 15 O CreativeImagination
  "比较安静",                     // 16 E Sociability     R
  "对他人没有什么同情心",         // 17 A Compassion      R
  "做事有计划有条理",             // 18 C Organization
  "容易紧张",                     // 19 N Anxiety
  "着迷于艺术、音乐或文学",       // 20 O AestheticSensitivity
  "常常处于主导地位，像个领导一样", // 21 E Assertiveness
  "常与他人意见不和",             // 22 A Respectfulness  R
  "很难开始行动起来去完成一项任务", // 23 C Productiveness R
  "觉得有安全感，对自己满意",     // 24 N Depression      R
  "不喜欢知识性或者哲学性强的讨论", // 25 O IntellectualCuriosity R
  "不如别人有活力",               // 26 E Energy          R
  "宽宏大量",                     // 27 A Trust
  "有时比较没有责任心",           // 28 C Responsibility  R
  "情绪稳定，不易生气",           // 29 N EmotionalVolatility R
  "几乎没有什么创造性",           // 30 O CreativeImagination R
  "有时会害羞，比较内向",         // 31 E Sociability     R
  "乐于助人，待人无私",           // 32 A Compassion
  "习惯让事物保持整洁有序",       // 33 C Organization
  "时常忧心忡忡，担心很多事情",   // 34 N Anxiety
  "重视艺术与审美",               // 35 O AestheticSensitivity
  "感觉自己很难对他人产生影响",   // 36 E Assertiveness   R
  "有时对人比较粗鲁",             // 37 A Respectfulness  R
  "有效率，做事有始有终",         // 38 C Productiveness
  "时常觉得悲伤",                 // 39 N Depression
  "思想深刻",                     // 40 O IntellectualCuriosity
  "精力充沛",                     // 41 E Energy
  "不相信别人，怀疑别人的意图",   // 42 A Trust           R
  "可靠的，总是值得他人信赖",     // 43 C Responsibility
  "能够控制自己的情绪",           // 44 N EmotionalVolatility R
  "缺乏想象力",                   // 45 O CreativeImagination R
  "爱说话，健谈",                 // 46 E Sociability
  "有时对人冷淡，漠不关心",       // 47 A Compassion      R
  "乱糟糟的，不爱收拾",           // 48 C Organization    R
  "很少觉得焦虑或者害怕",         // 49 N Anxiety         R
  "觉得诗歌、戏剧很无聊",         // 50 O AestheticSensitivity R
  "更喜欢让别人来领头负责",       // 51 E Assertiveness   R
  "待人谦逊礼让",                 // 52 A Respectfulness
  "有恒心，能坚持把事情做完",     // 53 C Productiveness
  "时常觉得郁郁寡欢",             // 54 N Depression
  "对抽象的概念和想法没什么兴趣", // 55 O IntellectualCuriosity R
  "充满热情",                     // 56 E Energy
  "把人往最好的方面想",           // 57 A Trust
  "有时候会做出一些不负责任的行为", // 58 C Responsibility R
  "情绪多变，容易愤怒",           // 59 N EmotionalVolatility
  "有创意，能想出新点子",         // 60 O CreativeImagination
];

// 反向计分题号（Zhang 附录）
const REVERSE = new Set([
  3, 4, 5, 8, 9, 11, 12, 16, 17, 22, 23, 24, 25, 26, 28, 29, 30, 31, 36, 37,
  42, 44, 45, 47, 48, 49, 50, 51, 55, 58,
]);

// 题号 -> 领域（每5题循环一次：E A C N O）
const DOMAIN_CYCLE: Array<"E" | "A" | "C" | "N" | "O"> = ["E", "A", "C", "N", "O"];

// 题号 -> 子维度
const ITEM_FACET: Record<number, string> = {};
const FACET_ROWS: { facet: string; items: number[] }[] = [
  { facet: "Sociability",           items: [1, 16, 31, 46] },
  { facet: "Assertiveness",         items: [6, 21, 36, 51] },
  { facet: "Energy",                items: [11, 26, 41, 56] },
  { facet: "Compassion",            items: [2, 17, 32, 47] },
  { facet: "Respectfulness",        items: [7, 22, 37, 52] },
  { facet: "Trust",                 items: [12, 27, 42, 57] },
  { facet: "Organization",          items: [3, 18, 33, 48] },
  { facet: "Productiveness",        items: [8, 23, 38, 53] },
  { facet: "Responsibility",        items: [13, 28, 43, 58] },
  { facet: "Anxiety",               items: [4, 19, 34, 49] },
  { facet: "Depression",            items: [9, 24, 39, 54] },
  { facet: "EmotionalVolatility",   items: [14, 29, 44, 59] },
  { facet: "IntellectualCuriosity", items: [10, 25, 40, 55] },
  { facet: "AestheticSensitivity",  items: [5, 20, 35, 50] },
  { facet: "CreativeImagination",   items: [15, 30, 45, 60] },
];
for (const { facet, items } of FACET_ROWS) {
  for (const n of items) ITEM_FACET[n] = facet;
}

const STEM = "我是一个……的人";

const HEADERS = [
  "content", "modelType", "dimension", "weight",
  "gender", "ageMin", "ageMax", "isActive",
  "bfiItemNo", "bfiReverse", "bfiFacet",
];

const QUESTIONS = DESCRIPTORS.map((desc, i) => {
  const n = i + 1;
  const domain = DOMAIN_CYCLE[(n - 1) % 5];
  return [
    `${STEM} ${n}. ${desc}`,  // content
    "BIG5",                    // modelType
    domain,                    // dimension
    1.0,                       // weight
    "both",                    // gender
    0,                         // ageMin
    999,                       // ageMax
    "TRUE",                    // isActive
    n,                         // bfiItemNo
    REVERSE.has(n) ? "Y" : "N", // bfiReverse
    ITEM_FACET[n] ?? "",        // bfiFacet
  ];
});

const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...QUESTIONS]);

ws["!cols"] = [
  { wch: 55 }, // content
  { wch: 10 }, // modelType
  { wch: 12 }, // dimension
  { wch: 8  }, // weight
  { wch: 8  }, // gender
  { wch: 8  }, // ageMin
  { wch: 8  }, // ageMax
  { wch: 10 }, // isActive
  { wch: 10 }, // bfiItemNo
  { wch: 12 }, // bfiReverse
  { wch: 25 }, // bfiFacet
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "题库");

const out = path.resolve(__dirname, "questions_test.xlsx");
XLSX.writeFile(wb, out);
console.log(`BFI-2 题库已生成：${out}`);
console.log(`共 ${QUESTIONS.length} 题（60 题 BFI-2 中文版）`);
