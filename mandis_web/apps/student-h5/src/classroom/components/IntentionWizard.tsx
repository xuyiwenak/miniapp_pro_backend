import { useRef, useState } from 'react';
import {
  LeftOutlined, RightOutlined, CheckOutlined, SmileOutlined, CoffeeOutlined, ThunderboltOutlined,
  ExclamationCircleOutlined, UserOutlined, FireOutlined, LockOutlined, RocketOutlined, MoreOutlined,
} from '@ant-design/icons';
import { EMOTION_OPTIONS, type IntentionInput, type IntentionRecord, type Locale }
  from '@mandis/common/classroom-types';
import { VAD_ASSETS } from './vadAssets';
import { ScoreChoice, useDraft, useSaveDraft } from './ReflectionInputs';

const LAST_PAGE = 4;
const DIMENSIONS = [
  { field: 'intendedValence', asset: 'valence', title: ['从不愉悦到愉悦', 'From unpleasant to pleasant'],
    anchors: ['1 非常不愉悦 · 5 中性 · 9 非常愉悦', '1 Unpleasant · 5 Neutral · 9 Pleasant'] },
  { field: 'intendedArousal', asset: 'arousal', title: ['从平静到激活', 'From calm to activated'],
    anchors: ['1 非常平静 · 5 中等 · 9 非常激活', '1 Calm · 5 Moderate · 9 Activated'] },
  { field: 'intendedDominance', asset: 'dominance', title: ['从受限到有掌控感', 'From constrained to in control'],
    anchors: ['1 非常受限 · 5 中等 · 9 非常有掌控感', '1 Constrained · 5 Moderate · 9 In control'] },
] as const;
const EMOTION_ICONS = [SmileOutlined, CoffeeOutlined, ThunderboltOutlined, ExclamationCircleOutlined,
  UserOutlined, FireOutlined, LockOutlined, RocketOutlined, MoreOutlined];
type FieldsProps = { zh: boolean; input: IntentionInput; update: (patch: Partial<IntentionInput>) => void };
function pageComplete(input: IntentionInput, page: number): boolean {
  if (page < DIMENSIONS.length) return Boolean(input[DIMENSIONS[page].field]);
  if (page === 3) return input.intendedEmotions.length > 0
    && (!input.intendedEmotions.includes('other') || Boolean(input.otherEmotion?.trim()));
  return Boolean(input.expressionConfidence);
}
export function IntentionForm({ locale, saved, cacheKey, onSave }: {
  locale: Locale; saved?: IntentionRecord; cacheKey: string;
  onSave: (input: IntentionInput, submit: boolean) => Promise<void>;
}) {
  const zh = locale === 'zh-CN';
  const [input, setInput] = useDraft<IntentionInput>(cacheKey, { intendedValence: saved?.intendedValence,
    intendedArousal: saved?.intendedArousal, intendedDominance: saved?.intendedDominance,
    intendedEmotions: saved?.intendedEmotions ?? [], expressionConfidence: saved?.expressionConfidence,
    intentionText: saved?.intentionText, otherEmotion: saved?.otherEmotion });
  const [page, setPage] = useState(() => [0, 1, 2, 3, 4].find((index) => !pageComplete(input, index)) ?? 0);
  const heading = useRef<HTMLHeadingElement>(null);
  const { message, saving, save } = useSaveDraft(zh, input, onSave);
  const update = (patch: Partial<IntentionInput>) => setInput({ ...input, ...patch });
  const navigate = (next: number) => {
    setPage(next);
    heading.current?.scrollIntoView({ block: 'start' });
    heading.current?.focus({ preventScroll: true });
  };
  return <section className="intention-wizard">
    <WizardProgress zh={zh} page={page} back={() => navigate(page - 1)} />
    <h1 ref={heading} tabIndex={-1}>{zh ? '你希望作品传达怎样的感觉？' : 'What feeling should your artwork convey?'}</h1>
    <p className="redesign-intro">{zh ? '在看 AI 回响前，先选出你创作时想表达的感觉。'
      : 'Before viewing the AI reflection, choose the feeling you intended to express.'}</p>
    {page < DIMENSIONS.length ? <VisualVad zh={zh} input={input} update={update} page={page} />
      : page === 3 ? <EmotionChoices zh={zh} input={input} update={update} />
        : <ExpressionConfidence zh={zh} input={input} update={update} />}
    <p className="reflection-message" role="status">{message}</p>
    <button className="classroom-primary" type="button" disabled={saving || !pageComplete(input, page)}
      onClick={() => page === LAST_PAGE ? void save(true) : navigate(page + 1)}>
      {page === LAST_PAGE ? (zh ? '确认，查看回响' : 'Confirm and view reflection') : (zh ? '下一题' : 'Next')}
      {page !== LAST_PAGE && <RightOutlined aria-hidden />}
    </button>
    <button className="reflection-text-button wizard-save" type="button" disabled={saving}
      onClick={() => void save(false)}>{zh ? '保存，稍后继续' : 'Save for later'}</button>
  </section>;
}
function WizardProgress({ zh, page, back }: { zh: boolean; page: number; back: () => void }) {
  return <div className="wizard-progress">
    <div><button type="button" onClick={back} disabled={page === 0} aria-label={zh ? '上一题' : 'Previous question'}>
      <LeftOutlined aria-hidden /></button><span>{zh ? '作品表达' : 'Artwork intention'} · {page + 1} / 5</span></div>
    <progress value={page + 1} max={5} aria-label={zh ? '作品表达进度' : 'Intention progress'} />
  </div>;
}
function VisualVad({ zh, input, update, page }: FieldsProps & { page: number }) {
  const dimension = DIMENSIONS[page];
  const value = input[dimension.field];
  return <fieldset className="visual-vad">
    <legend>{zh ? '这一题：' : 'This question: '}{dimension.title[zh ? 0 : 1]}</legend>
    <p>{zh ? '点选最接近的一张图' : 'Choose the closest image'}</p>
    <div className="visual-vad__grid">
      {VAD_ASSETS[dimension.asset].map((src, index) => <label key={src} className={value === index + 1 ? 'is-selected' : ''}>
        <input type="radio" name={`intention-${dimension.field}`} checked={value === index + 1}
          aria-label={`${dimension.title[zh ? 0 : 1]} ${index + 1}`}
          onChange={() => update({ [dimension.field]: index + 1 })} />
        <img src={src} alt="" /><span>{index + 1}</span>
        {value === index + 1 && <CheckOutlined className="visual-vad__check" aria-hidden />}
      </label>)}
    </div>
    <p className="visual-vad__anchors">{dimension.anchors[zh ? 0 : 1]}</p>
    <p className="visual-vad__selection" aria-live="polite">{zh ? '已选择：' : 'Selected: '}{value ?? '—'} / 9</p>
  </fieldset>;
}
function EmotionChoices({ zh, input, update }: FieldsProps) {
  return <fieldset className="emotion-choice">
    <legend>{zh ? '希望观看者感受到什么？' : 'What should viewers feel?'}</legend>
    <p>{zh ? '选 1–3 个最接近的感受' : 'Choose 1–3 feelings'}</p>
    <div className="emotion-choice__grid">{EMOTION_OPTIONS.map(([code, cn, en], index) => {
      const Icon = EMOTION_ICONS[index];
      const selected = input.intendedEmotions.includes(code);
      return <label key={code} className={selected ? 'is-selected' : ''}>
        <input type="checkbox" checked={selected} disabled={!selected && input.intendedEmotions.length >= 3}
          onChange={(event) => update({ intendedEmotions: event.target.checked
            ? [...input.intendedEmotions, code] : input.intendedEmotions.filter((item) => item !== code) })} />
        <Icon aria-hidden /><span>{zh ? cn : en}</span>{selected && <CheckOutlined className="choice-check" aria-hidden />}
      </label>;
    })}</div>
    {input.intendedEmotions.includes('other') && <label className="other-emotion">{zh ? '其他情绪' : 'Other feeling'}
      <input maxLength={50} value={input.otherEmotion ?? ''}
        onChange={(event) => update({ otherEmotion: event.target.value })} /></label>}
  </fieldset>;
}
function ExpressionConfidence({ zh, input, update }: FieldsProps) {
  return <div className="expression-confidence">
    <ScoreChoice label={zh ? '作品把你的意思表达出来了吗？' : 'How fully does the work express your intention?'}
      value={input.expressionConfidence} onChange={(expressionConfidence) => update({ expressionConfidence })}
      anchors={zh ? '1 完全没有 · 7 非常充分' : '1 Not at all · 7 Fully'} />
    <label>{zh ? '还想补充一句吗？（选填）' : 'Anything to add? (optional)'}
      <textarea maxLength={200} value={input.intentionText ?? ''}
        placeholder={zh ? '请勿填写姓名等身份信息' : 'Please omit identifying details'}
        onChange={(event) => update({ intentionText: event.target.value })} /></label>
    <p>{zh ? '确认后，看看 AI 如何理解你的作品。' : 'Confirm to see how AI interprets your work.'}</p>
  </div>;
}
