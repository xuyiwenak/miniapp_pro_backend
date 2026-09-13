import { MODULE_LABELS, type EvaluationInput, type EvaluationRecord, type EchoResult, type Locale }
  from '@mandis/common/classroom-types';
import { ScoreChoice, useDraft, useSaveDraft } from './ReflectionInputs';

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
