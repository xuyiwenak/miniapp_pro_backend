/**
 * BFI-2 中文版（Zhang 等附录）条目元数据：题号、领域、反向、层面。
 * 与 scripts/generate_bfi2_sample_xlsx.mjs 附录一致。
 */
import type { Big5Dim } from "../entity/question.entity";

export const BFI2_INSTRUMENT_VERSION = "BFI2_CN_60";
export const BFI2_NORM_VERSION_DEFAULT = "BFI2_CN_Zhang2021_college_v1";

/** 题干全句 */
export const BFI2_DESCRIPTORS: readonly string[] = [
  "朋友聚会时，我经常是最先打开话题的那个",
  "看到朋友倒霉或流浪动物，我会忍不住心疼",
  "我的桌面和电脑桌面差不多——乱起来挺壮观的",
  "截止日前夕，我依然能吃好睡好，不太会慌",
  "进博物馆或看展，我更多是陪朋友，自己没太大感觉",
  "开会时，我不太怕说出和大家不一样的意见",
  "和人有不同意见时，我会先听对方把话说完",
  "明天能做的事，今天我很难主动去碰它",
  "事情搞砸之后，我通常很快就能缓过来",
  "我很容易被各种新话题吸引，一搜起来就停不下来",
  "大多数事情都提不起我太大劲，状态比较平",
  "别人做事时，我脑子里经常会冒出\"这里不对\"的念头",
  "朋友把事交给我，他们基本不需要追问进度",
  "我的心情有时像天气，自己也说不准几点会变",
  "遇到老方法解决不了的问题，我会忍不住想试新招",
  "多人场合里，我通常是偏安静、在旁边听的那种",
  "别人抱怨倒霉，我有时会觉得\"那也没什么大不了的\"",
  "出门旅行前，我喜欢提前把行程和要带的东西列好清单",
  "重要的事情前一天，我经常睡不太安稳",
  "一首好歌或一段好文字，有时能让我停下来反复回味",
  "小组没人带头时，我经常自然而然开始分配任务",
  "讨论时，我经常觉得对方的逻辑站不住脚",
  "面对一项新任务，我经常拖很久才能真正迈出第一步",
  "总体来说，我对自己现在的状态还算满意",
  "\"宇宙本质\"\"存在意义\"这类话题，我一般没太大兴趣聊",
  "和精力旺盛的朋友在一起，我通常是最先喊累的",
  "别人对我做了不太好的事，我通常不太记仇",
  "有时候答应了的事，我也会因为各种原因没兑现",
  "别人做了让我不爽的事，我通常也不太容易发火",
  "想新点子或新方案这件事，我觉得自己不太擅长",
  "第一次见很多新面孔，我可能会有点放不开",
  "朋友开口有困难，我基本会尽力帮忙",
  "用完东西我喜欢放回原位，不太能忍受乱摆着",
  "很多还没发生的事，我已经在脑子里预演各种可能出错的情况了",
  "买东西或布置空间时，好不好看对我很重要",
  "讨论时，我的意见好像不太容易推动别人改变想法",
  "不耐烦或心情差时，我说话有时会带点刺",
  "开始了的事，我通常会坚持收尾，不太喜欢烂尾",
  "有时没什么特别原因，我就会莫名觉得有点低落",
  "看一件事，我喜欢想背后的原因，不只停在表面",
  "忙了一整天，我通常还有余力做点自己想做的事",
  "别人主动示好时，我有时会想\"他这样做是为了什么\"",
  "交给我的事，我会当成自己的事来做",
  "就算心里不爽，我通常还是能保持表面平静",
  "让我凭空想象一个不存在的东西，我经常不知道从哪下手",
  "聊天时，我经常是话最多、话题最多的那个",
  "别人跟我倾诉时，我有时心里会觉得\"这跟我有什么关系\"",
  "我的房间或桌面经常处于\"一言难尽\"的状态",
  "大多数情况下，未来的不确定性不太会让我感到担忧",
  "诗歌、话剧这类东西，我通常觉得欣赏不来",
  "有人愿意拍板的话，我更乐意跟着执行，不想做那个做决定的人",
  "就算觉得自己是对的，我也会先给对方留余地",
  "做到一半遇到困难，我通常不会轻易放弃",
  "有时候我会提不起劲，不太想动",
  "理论和概念这些东西，我不太愿意花时间在上面",
  "做感兴趣的事时，我很容易进入停不下来的状态",
  "默认情况下，我倾向于相信别人是出于好意",
  "有时我会做出一些事后自己都觉得\"这不太妥\"的决定",
  "有些事很容易触发我，让我一下子就翻脸",
  "同一个问题，我经常能想出和别人不太一样的角度",
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

export function bfi2ItemContent(itemNo: number): string {
  return BFI2_DESCRIPTORS[itemNo - 1] ?? "";
}
