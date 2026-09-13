import { useEffect, useState } from 'react';
import {
  EMOTION_OPTIONS, MODULE_LABELS,
  type IntentionInput, type IntentionRecord, type EvaluationInput, type EvaluationRecord,
  type EchoResult, type Locale,
} from '@mandis/common/classroom-types';

const VAD_SCORES = Array.from({ length: 9 }, (_, index) => index + 1);
const LIKERT_SCORES = VAD_SCORES.slice(0, 7);
function useDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T ?? initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Keep in-memory answers. */ } },
    [key, value]);
  return [value, setValue] as const;
}
export function ScoreChoice({ label, value, onChange, vad = false, anchors }: {
  label: string; value?: number; onChange: (score: number) => void; vad?: boolean; anchors: string;
}) {
  return <fieldset className="reflection-question">
    <legend>{label}</legend>
    <p className="reflection-anchors">{anchors}</p>
    <div className={`reflection-scores${vad ? ' is-vad' : ''}`}>{(vad ? VAD_SCORES : LIKERT_SCORES).map((score) =>
      <label key={score} className={value === score ? 'is-selected' : ''}>
        <input type="radio" checked={value === score} onChange={() => onChange(score)} />{score}
      </label>)}</div>
  </fieldset>;
}
export function IntentionForm({ locale, saved, cacheKey, onSave }: {
  locale: Locale; saved?: IntentionRecord; cacheKey: string;
  onSave: (input: IntentionInput, submit: boolean) => Promise<void>;
}) {
  const zh = locale === 'zh-CN';
  const [input, setInput] = useDraft<IntentionInput>(cacheKey, {
    intendedEmotions: saved?.intendedEmotions ?? [], intendedValence: saved?.intendedValence,
    intendedArousal: saved?.intendedArousal, intendedDominance: saved?.intendedDominance,
    expressionConfidence: saved?.expressionConfidence, intentionText: saved?.intentionText,
    otherEmotion: saved?.otherEmotion,
  });
  const { message, saving, save } = useSaveDraft(zh, input, onSave);
  const update = (patch: Partial<IntentionInput>) => setInput({ ...input, ...patch });
  const complete = input.intendedValence && input.intendedArousal && input.intendedDominance
    && input.expressionConfidence && input.intendedEmotions.length > 0
    && (!input.intendedEmotions.includes('other') || input.otherEmotion?.trim());
  return <section className="reflection-form">
    <h1>{zh ? '我想让这幅作品表达什么' : 'What I want my artwork to express'}</h1>
    <p>{zh ? '请按创作时的意图回答，没有正确答案。默认不向教师展示；授权内容可用于研究。'
      : 'There is no right answer. Describe your intention. Research use follows your consent.'}</p>
    <IntentionFields zh={zh} input={input} update={update} />
    <p>{zh ? '提交后将进入 AI 回响，请确认这是你当下的表达。' : 'Confirm your intention before viewing the AI reflection.'}</p>
    <p role="status">{message}</p>
    <button type="button" className="classroom-secondary" disabled={saving} onClick={() => void save(false)}>
      {zh ? '保存草稿' : 'Save draft'}</button>
    <button type="button" className="classroom-primary" disabled={saving || !complete} onClick={() => void save(true)}>
      {zh ? '提交表达意图' : 'Submit intention'}</button>
  </section>;
}

const CORE_QUESTIONS = [
  ['feedbackOverallHelpful', '总体上，这份反馈对我有帮助。', 'Overall, this feedback is helpful.'],
  ['feedbackReflectionHelp', '这份反馈促使我从新的角度思考自己的作品。', 'This feedback helps me reflect from a new perspective.'],
  ['feedbackDiscomfort', '阅读这份反馈让我感到不适。', 'Reading this feedback made me uncomfortable.'],
] as const;
export function EvaluationForm({ locale, echo, saved, cacheKey, onSave }: {
  locale: Locale; echo: EchoResult; saved?: EvaluationRecord; cacheKey: string;
  onSave: (input: EvaluationInput, submit: boolean) => Promise<void>;
}) {
  const zh = locale === 'zh-CN';
  const [input, setInput] = useDraft<EvaluationInput>(cacheKey, {
    analysisRunId: echo.analysisRunId ?? '', reportVersion: echo.reportVersion ?? '',
    moduleResponses: saved?.moduleResponses ?? {}, overallComment: saved?.overallComment,
    feedbackOverallHelpful: saved?.feedbackOverallHelpful, feedbackReflectionHelp: saved?.feedbackReflectionHelp,
    feedbackDiscomfort: saved?.feedbackDiscomfort,
  });
  const { message, saving, save } = useSaveDraft(zh, input, onSave);
  return <section className="reflection-form">
    <h2>{zh ? '这份 AI 回响对你有帮助吗？' : 'Was this reflection helpful?'}</h2>
    <p>{zh ? '评价不影响成绩，也不会修改已生成的回响。' : 'Your response does not affect grades or change this report.'}</p>
    {CORE_QUESTIONS.map(([code, cn, en]) => <ScoreChoice key={code} label={zh ? cn : en}
      value={input[code]} onChange={(value) => setInput({ ...input, [code]: value })}
      anchors={zh ? '1 非常不同意 · 4 既不同意也不反对 · 7 非常同意' : '1 Strongly disagree · 4 Neutral · 7 Strongly agree'} />)}
    <ModuleFields zh={zh} echo={echo} input={input} setInput={setInput} />
    <label>{zh ? '补充说明（选填）' : 'Additional comments (optional)'}
      <textarea maxLength={300} value={input.overallComment ?? ''}
        placeholder={zh ? '哪些地方有帮助、哪些地方不符合你的表达，或其他感受。请勿填写身份信息。' : 'No identifying details, please.'}
        onChange={(event) => setInput({ ...input, overallComment: event.target.value })} /></label>
    {(input.feedbackDiscomfort ?? 0) >= 6 && <p role="status">{zh
      ? '谢谢你告诉我们。你可以隐藏这份回响或退出，无需说明原因。'
      : 'Thank you for telling us. You can hide the reflection or leave without explaining.'}</p>}
    <p role="status">{message}</p>
    <button type="button" className="classroom-secondary" disabled={saving} onClick={() => void save(false)}>
      {zh ? '保存草稿' : 'Save draft'}</button>
    <button type="button" className="classroom-primary"
      disabled={saving || CORE_QUESTIONS.some(([code]) => !input[code])} onClick={() => void save(true)}>
      {zh ? '提交评价' : 'Submit evaluation'}</button>
  </section>;
}

type IntentionFieldsProps = {
  zh: boolean; input: IntentionInput; update: (patch: Partial<IntentionInput>) => void;
};
function IntentionFields({ zh, input, update }: IntentionFieldsProps) {
  return <>
    <ScoreChoice vad label={zh ? '希望作品呈现的愉悦程度' : 'Intended pleasure'} value={input.intendedValence}
      anchors={zh ? '1 非常不愉悦 · 5 中性 · 9 非常愉悦' : '1 Unpleasant · 5 Neutral · 9 Pleasant'}
      onChange={(intendedValence) => update({ intendedValence })} />
    <ScoreChoice vad label={zh ? '希望作品呈现的激活程度' : 'Intended arousal'} value={input.intendedArousal}
      anchors={zh ? '1 非常平静 · 5 中等 · 9 非常激活' : '1 Calm · 5 Moderate · 9 Activated'}
      onChange={(intendedArousal) => update({ intendedArousal })} />
    <ScoreChoice vad label={zh ? '希望作品呈现的掌控程度' : 'Intended control'} value={input.intendedDominance}
      anchors={zh ? '1 非常受限 · 5 中等 · 9 非常有掌控感' : '1 Constrained · 5 Moderate · 9 In control'}
      onChange={(intendedDominance) => update({ intendedDominance })} />
    <EmotionFields zh={zh} input={input} update={update} />
    <ScoreChoice label={zh ? '作品表达意图的充分程度' : 'How fully does the work express your intention?'}
      value={input.expressionConfidence} onChange={(expressionConfidence) => update({ expressionConfidence })}
      anchors={zh ? '1 完全没有 · 7 非常充分' : '1 Not at all · 7 Fully'} />
    <label>{zh ? '一句话描述（选填，请勿填写身份信息）' : 'Optional description — no identifying details'}
      <textarea maxLength={200} value={input.intentionText ?? ''}
        onChange={(event) => update({ intentionText: event.target.value })} /></label>
  </>;
}
function EmotionFields({ zh, input, update }: IntentionFieldsProps) {
  return <>
    <fieldset className="reflection-question"><legend>{zh ? '希望观看者感受到什么？选 1–3 个' : 'Select 1–3 emotions'}</legend>
      <div className="reflection-emotions">{EMOTION_OPTIONS.map(([code, cn, en]) => <label key={code}>
        <input type="checkbox" checked={input.intendedEmotions.includes(code)}
          disabled={!input.intendedEmotions.includes(code) && input.intendedEmotions.length >= 3}
          onChange={(event) => update({ intendedEmotions: event.target.checked
            ? [...input.intendedEmotions, code] : input.intendedEmotions.filter((item) => item !== code) })} />
        {zh ? cn : en}</label>)}</div>
      {input.intendedEmotions.includes('other') && <input aria-label={zh ? '其他情绪' : 'Other emotion'}
        maxLength={50} value={input.otherEmotion ?? ''} onChange={(event) => update({ otherEmotion: event.target.value })} />}
    </fieldset>
  </>;
}

function ModuleFields({ zh, echo, input, setInput }: {
  zh: boolean; echo: EchoResult; input: EvaluationInput; setInput: (input: EvaluationInput) => void;
}) {
  return <>
    {(echo.modules ?? []).map((code) => <fieldset className="reflection-question" key={code}>
      <legend>{MODULE_LABELS[code][zh ? 0 : 1]}{zh ? '（选填）' : ' (optional)'}</legend>
      <p>{code === 'suggestion' ? (zh ? '这部分建议对你有帮助吗？' : 'Is this suggestion helpful?')
        : (zh ? '这部分解读与你的表达是否相符？' : 'Does this interpretation match your intention?')}</p>
      <div className="reflection-emotions">{(code === 'suggestion'
        ? [['helpful', '有帮助', 'Helpful'], ['partly_helpful', '部分有帮助', 'Partly helpful'],
          ['not_helpful', '没有帮助', 'Not helpful'], ['cannot_judge', '无法判断', 'Cannot judge']]
        : [['matches', '符合', 'Matches'], ['partly_matches', '部分符合', 'Partly matches'],
          ['does_not_match', '不符合', 'Does not match'], ['cannot_judge', '无法判断', 'Cannot judge']])
        .map(([responseCode, cn, en]) => <label key={responseCode}>
          <input type="radio" checked={input.moduleResponses[code]?.responseCode === responseCode}
            onChange={() => setInput({ ...input, moduleResponses: { ...input.moduleResponses,
              [code]: { responseCode, missingReason: null } } })} />{zh ? cn : en}</label>)}</div>
    </fieldset>)}
  </>;
}

function useSaveDraft<T>(zh: boolean, input: T, onSave: (input: T, submit: boolean) => Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  async function save(submit: boolean) {
    setSaving(true); setMessage('');
    try { await onSave(input, submit); setMessage(zh ? '已保存' : 'Saved'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save'); }
    finally { setSaving(false); }
  }
  return { saving, message, save };
}
