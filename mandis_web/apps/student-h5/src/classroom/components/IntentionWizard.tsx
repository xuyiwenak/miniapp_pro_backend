import { CheckOutlined, SmileOutlined, CoffeeOutlined, ThunderboltOutlined, ExclamationCircleOutlined,
  UserOutlined, FireOutlined, LockOutlined, RocketOutlined, MoreOutlined } from '@ant-design/icons';
import { EMOTION_OPTIONS, type IntentionInput, type IntentionRecord, type Locale }
  from '@mandis/common/classroom-types';
import { ScoreChoice, useDraft, useSaveDraft } from './ReflectionInputs';

const EMOTION_ICONS = [SmileOutlined, CoffeeOutlined, ThunderboltOutlined, ExclamationCircleOutlined,
  UserOutlined, FireOutlined, LockOutlined, RocketOutlined, MoreOutlined];
type FieldsProps = { zh: boolean; input: IntentionInput; update: (patch: Partial<IntentionInput>) => void };
export function IntentionForm({ locale, saved, cacheKey, onSave }: {
  locale: Locale; saved?: IntentionRecord; cacheKey: string;
  onSave: (input: IntentionInput, submit: boolean) => Promise<void>;
}) {
  const zh = locale === 'zh-CN';
  const [input, setInput] = useDraft<IntentionInput>(`${cacheKey}:v2`, {
    intendedEmotions: saved?.intendedEmotions ?? [], expressionConfidence: saved?.expressionConfidence,
    intentionText: saved?.intentionText, otherEmotion: saved?.otherEmotion,
  });
  const { message, saving, save } = useSaveDraft(zh, input, onSave);
  const update = (patch: Partial<IntentionInput>) => setInput({ ...input, ...patch });
  const complete = input.intendedEmotions.length > 0 && input.expressionConfidence
    && (!input.intendedEmotions.includes('other') || Boolean(input.otherEmotion?.trim()));
  return <section className="intention-wizard">
    <p className="evaluation-progress"><CheckOutlined /> {zh ? '课后感受已保存' : 'Post-class feelings saved'}</p>
    <h1>{zh ? '这幅作品，你最想表达哪些感觉？' : 'What feelings did you want this artwork to express?'}</h1>
    <p>{zh ? '先选出创作时想表达的感觉，再看看 AI 的理解。' : 'Choose your intended feelings before viewing AI.'}</p>
    <EmotionChoices zh={zh} input={input} update={update} />
    <ScoreChoice label={zh ? '作品把你的意思表达出来了吗？' : 'How fully does the work express your intention?'}
      value={input.expressionConfidence} onChange={(expressionConfidence) => update({ expressionConfidence })}
      anchors={zh ? '1 完全没有 · 7 非常充分' : '1 Not at all · 7 Fully'} />
    <label>{zh ? '还想补充一句吗？（选填）' : 'Anything to add? (optional)'}
      <textarea maxLength={200} value={input.intentionText ?? ''}
        placeholder={zh ? '请勿填写姓名等身份信息' : 'Please omit identifying details'}
        onChange={(e) => update({ intentionText: e.target.value })} /></label>
    <p className="reflection-message" role="status">{message}</p>
    <button className="classroom-primary" disabled={saving || !complete} onClick={() => void save(true)}>
      {zh ? '确认表达，查看 AI 回响' : 'Confirm intention and view AI'}</button>
    <button className="reflection-text-button" disabled={saving} onClick={() => void save(false)}>
      {zh ? '保存，稍后继续' : 'Save for later'}</button>
  </section>;
}
export function EmotionChoices({ zh, input, update }: FieldsProps) {
  return <fieldset className="emotion-choice">
    <legend>{zh ? '选 1–3 个最接近的感受' : 'Choose 1–3 feelings'}</legend>
    <div className="emotion-choice__grid">{EMOTION_OPTIONS.map(([code, cn, en], index) => {
      const Icon = EMOTION_ICONS[index]; const selected = input.intendedEmotions.includes(code);
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
