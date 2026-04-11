/**
 * 从 Zhang 等 BFI-2 中文版附录生成调试用 Excel（不修改时可直接删除本脚本）
 * 运行：node scripts/generate_bfi2_sample_xlsx.mjs
 */
import XLSX from "xlsx";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 附录题干（序号 1–60），表述为「我是一个……的人」中的描述部分 */
const DESCRIPTORS = [
  "性格外向，喜欢交际",
  "心肠柔软，有同情心",
  "缺乏条理",
  "从容，善于处理压力",
  "对艺术没有什么兴趣",
  "性格坚定自信，敢于表达自己的观点",
  "为人恭谦，尊重他人",
  "比较懒",
  "经历挫折后仍能保持积极心态",
  "对许多不同的事物都感兴趣",
  "很少觉得兴奋或者特别想要(做)什么",
  "常常挑别人的毛病",
  "可信赖的，可靠的",
  "喜怒无常，情绪起伏较多",
  "善于创造，能找到聪明的方法来做事",
  "比较安静",
  "对他人没有什么同情心",
  "做事有计划有条理",
  "容易紧张",
  "着迷于艺术、音乐或文学",
  "常常处于主导地位，像个领导一样",
  "常与他人意见不和",
  "很难开始行动起来去完成一项任务",
  "觉得有安全感，对自己满意",
  "不喜欢知识性或者哲学性强的讨论",
  "不如别人有活力",
  "宽宏大量",
  "有时比较没有责任心",
  "情绪稳定，不易生气",
  "几乎没有什么创造性",
  "有时会害羞，比较内向",
  "乐于助人，待人无私",
  "习惯让事物保持整洁有序",
  "时常忧心忡忡，担心很多事情",
  "重视艺术与审美",
  "感觉自己很难对他人产生影响",
  "有时对人比较粗鲁",
  "有效率，做事有始有终",
  "时常觉得悲伤",
  "思想深刻",
  "精力充沛",
  "不相信别人，怀疑别人的意图",
  "可靠的，总是值得他人信赖",
  "能够控制自己的情绪",
  "缺乏想象力",
  "爱说话，健谈",
  "有时对人冷淡，漠不关心",
  "乱糟糟的，不爱收拾",
  "很少觉得焦虑或者害怕",
  "觉得诗歌、戏剧很无聊",
  "更喜欢让别人来领头负责",
  "待人谦逊礼让",
  "有恒心，能坚持把事情做完",
  "时常觉得郁郁寡欢",
  "对抽象的概念和想法没什么兴趣",
  "充满热情",
  "把人往最好的方面想",
  "有时候会做出一些不负责任的行为",
  "情绪多变，容易愤怒",
  "有创意，能想出新点子",
];

/** 附录计分说明中的反向题（填答后需作 6−原始分） */
const REVERSE = new Set([
  3, 4, 5, 8, 9, 11, 12, 16, 17, 22, 23, 24, 25, 26, 28, 29, 30, 31, 36, 37, 42, 44, 45, 47, 48, 49, 50, 51, 55, 58,
]);

const DOMAIN = {
  1: "E", 2: "A", 3: "C", 4: "N", 5: "O",
  6: "E", 7: "A", 8: "C", 9: "N", 10: "O",
  11: "E", 12: "A", 13: "C", 14: "N", 15: "O",
  16: "E", 17: "A", 18: "C", 19: "N", 20: "O",
  21: "E", 22: "A", 23: "C", 24: "N", 25: "O",
  26: "E", 27: "A", 28: "C", 29: "N", 30: "O",
  31: "E", 32: "A", 33: "C", 34: "N", 35: "O",
  36: "E", 37: "A", 38: "C", 39: "N", 40: "O",
  41: "E", 42: "A", 43: "C", 44: "N", 45: "O",
  46: "E", 47: "A", 48: "C", 49: "N", 50: "O",
  51: "E", 52: "A", 53: "C", 54: "N", 55: "O",
  56: "E", 57: "A", 58: "C", 59: "N", 60: "O",
};

const DOMAIN_ZH = { E: "外向性", A: "宜人性", C: "尽责性", N: "负性情绪/神经质", O: "开放性" };

/** 子维度（条目号与附录一致，R 已在 reverse 列体现） */
const FACET_ROWS = [
  { facet: "Sociability", facetZh: "社交", items: [1, 16, 31, 46] },
  { facet: "Assertiveness", facetZh: "果断", items: [6, 21, 36, 51] },
  { facet: "Energy", facetZh: "活力", items: [11, 26, 41, 56] },
  { facet: "Compassion", facetZh: "同情", items: [2, 17, 32, 47] },
  { facet: "Respectfulness", facetZh: "谦恭", items: [7, 22, 37, 52] },
  { facet: "Trust", facetZh: "信任", items: [12, 27, 42, 57] },
  { facet: "Organization", facetZh: "条理", items: [3, 18, 33, 48] },
  { facet: "Productiveness", facetZh: "效率", items: [8, 23, 38, 53] },
  { facet: "Responsibility", facetZh: "负责", items: [13, 28, 43, 58] },
  { facet: "Anxiety", facetZh: "焦虑", items: [4, 19, 34, 49] },
  { facet: "Depression", facetZh: "抑郁", items: [9, 24, 39, 54] },
  { facet: "Emotional Volatility", facetZh: "易变", items: [14, 29, 44, 59] },
  { facet: "Intellectual Curiosity", facetZh: "好奇", items: [10, 25, 40, 55] },
  { facet: "Aesthetic Sensitivity", facetZh: "审美", items: [5, 20, 35, 50] },
  { facet: "Creative Imagination", facetZh: "想象", items: [15, 30, 45, 60] },
];

const itemToFacet = {};
for (const { facet, facetZh, items } of FACET_ROWS) {
  for (const n of items) {
    itemToFacet[n] = { facet, facetZh };
  }
}

const STEM = "我是一个……的人";

const rows = DESCRIPTORS.map((descriptor, i) => {
  const n = i + 1;
  const d = DOMAIN[n];
  const ft = itemToFacet[n];
  return {
    itemNo: n,
    itemCode: `BFI${n}`,
    domain: d,
    domainZh: DOMAIN_ZH[d],
    facet: ft?.facet ?? "",
    facetZh: ft?.facetZh ?? "",
    reverse: REVERSE.has(n) ? "Y" : "N",
    textStem: STEM,
    textDescriptor: descriptor,
    fullPrompt: `我是一个……的人 ${n}. ${descriptor}`,
  };
});

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "BFI2_CN");

const meta = [
  { key: "source", value: "Zhang et al., BFI-2 中文版附录（预印本 PDF）" },
  { key: "likert", value: "1=非常不同意 … 5=非常同意" },
  { key: "reverse_note", value: "reverse=Y 时，计分用 6−原始分后再汇总/求均" },
];
const wsMeta = XLSX.utils.json_to_sheet(meta);
XLSX.utils.book_append_sheet(wb, wsMeta, "meta");

const outPath = join(__dirname, "sample_ BFI-2.xlsx");
XLSX.writeFile(wb, outPath);
console.log("Wrote", outPath);
