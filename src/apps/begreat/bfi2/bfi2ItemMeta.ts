/**
 * BFI-2 中文版（Zhang 等附录）条目元数据：题号、领域、反向、层面。
 * 与 scripts/generate_bfi2_sample_xlsx.mjs 附录一致。
 */
import type { Big5Dim } from "../entity/question.entity";

export const BFI2_INSTRUMENT_VERSION = "BFI2_CN_60";
export const BFI2_NORM_VERSION_DEFAULT = "BFI2_CN_Zhang2021_college_v1";

/** 附录题干：「我是一个……的人」后的描述部分 */
export const BFI2_DESCRIPTORS: readonly string[] = [
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

/** 附录计分说明中需反向计分的题号（1-based） */
export const BFI2_REVERSE_ITEMS = new Set([
  3, 4, 5, 8, 9, 11, 12, 16, 17, 22, 23, 24, 25, 26, 28, 29, 30, 31, 36, 37, 42, 44, 45, 47, 48, 49, 50, 51, 55, 58,
]);

const ITEM_DOMAIN: Big5Dim[] = [
  "E", "A", "C", "N", "O",
  "E", "A", "C", "N", "O",
  "E", "A", "C", "N", "O",
  "E", "A", "C", "N", "O",
  "E", "A", "C", "N", "O",
  "E", "A", "C", "N", "O",
  "E", "A", "C", "N", "O",
  "E", "A", "C", "N", "O",
  "E", "A", "C", "N", "O",
  "E", "A", "C", "N", "O",
  "E", "A", "C", "N", "O",
  "E", "A", "C", "N", "O",
];

export function bfi2DomainForItem(itemNo: number): Big5Dim | undefined {
  if (itemNo < 1 || itemNo > 60) return undefined;
  return ITEM_DOMAIN[itemNo - 1];
}

/** 15 个子维度键（与附录一致） */
export const BFI2_FACET_KEYS = [
  "Sociability",
  "Assertiveness",
  "Energy",
  "Compassion",
  "Respectfulness",
  "Trust",
  "Organization",
  "Productiveness",
  "Responsibility",
  "Anxiety",
  "Depression",
  "EmotionalVolatility",
  "IntellectualCuriosity",
  "AestheticSensitivity",
  "CreativeImagination",
] as const;

export type Bfi2FacetKey = (typeof BFI2_FACET_KEYS)[number];

/** 题号 -> 子维度（每题唯一） */
const ITEM_TO_FACET: Record<number, Bfi2FacetKey> = (() => {
  const m: Record<number, Bfi2FacetKey> = {} as Record<number, Bfi2FacetKey>;
  const rows: { facet: Bfi2FacetKey; items: number[] }[] = [
    { facet: "Sociability", items: [1, 16, 31, 46] },
    { facet: "Assertiveness", items: [6, 21, 36, 51] },
    { facet: "Energy", items: [11, 26, 41, 56] },
    { facet: "Compassion", items: [2, 17, 32, 47] },
    { facet: "Respectfulness", items: [7, 22, 37, 52] },
    { facet: "Trust", items: [12, 27, 42, 57] },
    { facet: "Organization", items: [3, 18, 33, 48] },
    { facet: "Productiveness", items: [8, 23, 38, 53] },
    { facet: "Responsibility", items: [13, 28, 43, 58] },
    { facet: "Anxiety", items: [4, 19, 34, 49] },
    { facet: "Depression", items: [9, 24, 39, 54] },
    { facet: "EmotionalVolatility", items: [14, 29, 44, 59] },
    { facet: "IntellectualCuriosity", items: [10, 25, 40, 55] },
    { facet: "AestheticSensitivity", items: [5, 20, 35, 50] },
    { facet: "CreativeImagination", items: [15, 30, 45, 60] },
  ];
  for (const { facet, items } of rows) {
    for (const n of items) m[n] = facet;
  }
  return m;
})();

export function bfi2FacetForItem(itemNo: number): Bfi2FacetKey | undefined {
  return ITEM_TO_FACET[itemNo];
}

export function bfi2AdjustedScore(rawLikert: number, itemNo: number): number {
  const base = rawLikert;
  if (BFI2_REVERSE_ITEMS.has(itemNo)) return 6 - base;
  return base;
}

export function bfi2Stem(): string {
  return "我是一个……的人";
}

export function bfi2ItemContent(itemNo: number): string {
  const d = BFI2_DESCRIPTORS[itemNo - 1];
  if (!d) return "";
  return `${bfi2Stem()} ${itemNo}. ${d}`;
}
