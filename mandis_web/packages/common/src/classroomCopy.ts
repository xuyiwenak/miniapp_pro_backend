import type { Locale } from './classroomTypes';

export const GRADE_LABELS: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    undergraduate_1: '本科一年级',
    undergraduate_2: '本科二年级',
    undergraduate_3: '本科三年级',
    undergraduate_4: '本科四年级',
    postgraduate: '研究生',
    continuing_education: '成人继续教育',
    mixed_adult: '成年混合年级',
    other_adult: '其他成年学习者',
  },
  en: {
    undergraduate_1: 'Undergraduate Year 1',
    undergraduate_2: 'Undergraduate Year 2',
    undergraduate_3: 'Undergraduate Year 3',
    undergraduate_4: 'Undergraduate Year 4',
    postgraduate: 'Postgraduate',
    continuing_education: 'Adult continuing education',
    mixed_adult: 'Mixed adult learners',
    other_adult: 'Other adult learners',
  },
};

export const COURSE_STEPS: Record<Locale, string[]> = {
  'zh-CN': ['课前测评', '线下创作', '上传作品', '课后测评', '作品回响'],
  en: ['Pre-test', 'Create', 'Upload', 'Post-test', 'Reflection'],
};

export const PANAS_ITEMS = [
  { code: 'PANAS_UPSET', zh: '心烦、不安的', en: 'Upset' },
  { code: 'PANAS_HOSTILE', zh: '有敌意的', en: 'Hostile' },
  { code: 'PANAS_ALERT', zh: '警觉、清醒的', en: 'Alert' },
  { code: 'PANAS_ASHAMED', zh: '羞愧的', en: 'Ashamed' },
  { code: 'PANAS_INSPIRED', zh: '受到启发的', en: 'Inspired' },
  { code: 'PANAS_NERVOUS', zh: '紧张的', en: 'Nervous' },
  { code: 'PANAS_DETERMINED', zh: '坚定的', en: 'Determined' },
  { code: 'PANAS_ATTENTIVE', zh: '专注的', en: 'Attentive' },
  { code: 'PANAS_AFRAID', zh: '害怕的', en: 'Afraid' },
  { code: 'PANAS_ACTIVE', zh: '活跃的', en: 'Active' },
] as const;

export const VAD_ITEMS = [
  {
    code: 'valence',
    zh: '愉悦度',
    en: 'Valence',
    zhHelp: '你此刻感到不愉快还是愉快。',
    enHelp: 'How unpleasant or pleasant you feel right now.',
    zhLow: '不愉快',
    enLow: 'Unpleasant',
    zhHigh: '愉快',
    enHigh: 'Pleasant',
  },
  {
    code: 'arousal',
    zh: '唤醒度',
    en: 'Arousal',
    zhHelp: '你此刻有多平静或多激动，高低没有好坏。',
    enHelp: 'How calm or activated you feel; neither end is better.',
    zhLow: '平静',
    enLow: 'Calm',
    zhHigh: '激动',
    enHigh: 'Activated',
  },
  {
    code: 'dominance',
    zh: '掌控感',
    en: 'Dominance',
    zhHelp: '你此刻感到无力、受影响，还是自主、有掌控感。',
    enHelp: 'How powerless or in control you feel right now.',
    zhLow: '无力',
    enLow: 'Powerless',
    zhHigh: '有掌控感',
    enHigh: 'In control',
  },
] as const;
