import { useState } from 'react';
import type {
  EvaluationInput, EvaluationRecord, EchoResult, Locale, ModuleCode, ModuleResponseCode,
} from '@mandis/common/classroom-types';
import { ScoreChoice, useDraft, useSaveDraft } from './ReflectionInputs';
import { AiContent } from './SessionReview';

const CORE_QUESTIONS = [
  ['feedbackOverallHelpful', '总体上，这份反馈对我有帮助。', 'Overall, this feedback is helpful.'],
  ['feedbackReflectionHelp', '这份反馈促使我从新的角度思考自己的作品。',
    'This feedback helps me reflect from a new perspective.'],
  ['feedbackDiscomfort', '阅读这份反馈让我感到不适。', 'Reading this feedback made me uncomfortable.'],
] as const;
const MATCH_RESPONSES: ModuleResponseCode[] = ['strongly_matches', 'partly_matches', 'does_not_match'];
const SUGGESTION_RESPONSES: ModuleResponseCode[] = ['very_helpful', 'partly_helpful', 'not_helpful'];

function scrollToTarget(selector: string): void {
  document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hasCurrentResponse(input: EvaluationInput, code: ModuleCode): boolean {
  const response = input.moduleResponses[code]?.responseCode;
  return Boolean(response && (code === 'suggestion' ? SUGGESTION_RESPONSES : MATCH_RESPONSES).includes(response));
}

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
  const [incompleteMessage, setIncompleteMessage] = useState('');
  const { message, saving, save } = useSaveDraft(zh, input, onSave);
  const shownModules = echo.modules ?? [];
  const answeredCount = shownModules.filter((code) => hasCurrentResponse(input, code)).length;

  function updateModule(code: ModuleCode, responseCode: ModuleResponseCode): void {
    setIncompleteMessage('');
    setInput({ ...input, moduleResponses: { ...input.moduleResponses,
      [code]: { responseCode, missingReason: null } } });
  }

  function submit(): void {
    const missingModule = shownModules.find((code) => !hasCurrentResponse(input, code));
    if (missingModule) {
      const remaining = shownModules.length - answeredCount;
      setIncompleteMessage(zh ? `还有 ${remaining} 段回响需要评价。`
        : `${remaining} reflection sections still need a response.`);
      scrollToTarget(`#module-evaluation-${missingModule}`);
      return;
    }
    if (CORE_QUESTIONS.some(([code]) => !input[code])) {
      setIncompleteMessage(zh ? '请完成下面三项整体感受。' : 'Please complete the three overall questions below.');
      scrollToTarget('.evaluation-overall');
      return;
    }
    void save(true);
  }

  return <div className="evaluation-flow">
    <AiContent echo={echo} zh={zh} waitExpired={false} failed={false} hasArtwork
      evaluation={{ modules: shownModules, responses: input.moduleResponses, onChange: updateModule }} />
    <p className="module-evaluation-progress" aria-live="polite">
      {zh ? `已评价 ${answeredCount} / ${shownModules.length}` : `${answeredCount} of ${shownModules.length} reviewed`}
    </p>
    <section className="reflection-form evaluation-overall">
      <h2>{zh ? '整体感受' : 'Overall experience'}</h2>
      <p>{zh ? '评价不影响成绩，也不会修改已生成的回响。'
        : 'Your response does not affect grades or change this report.'}</p>
      {CORE_QUESTIONS.map(([code, cn, en]) => <ScoreChoice key={code} label={zh ? cn : en}
        value={input[code]} onChange={(value) => setInput({ ...input, [code]: value })}
        anchors={zh ? '1 非常不同意 · 4 既不同意也不反对 · 7 非常同意'
          : '1 Strongly disagree · 4 Neutral · 7 Strongly agree'} />)}
      <label>{zh ? '补充说明（选填）' : 'Additional comments (optional)'}
        <textarea maxLength={300} value={input.overallComment ?? ''}
          placeholder={zh ? '哪些地方有帮助、哪些地方不符合你的表达，或其他感受。请勿填写身份信息。'
            : 'No identifying details, please.'}
          onChange={(event) => setInput({ ...input, overallComment: event.target.value })} /></label>
      {(input.feedbackDiscomfort ?? 0) >= 6 && <p role="status">{zh
        ? '谢谢你告诉我们。你可以隐藏这份回响或退出，无需说明原因。'
        : 'Thank you for telling us. You can hide the reflection or leave without explaining.'}</p>}
      <p className="reflection-incomplete" role="alert">{incompleteMessage}</p>
      <p role="status">{message}</p>
      <button type="button" className="classroom-secondary" disabled={saving} onClick={() => void save(false)}>
        {zh ? '保存草稿' : 'Save draft'}</button>
      <button type="button" className="classroom-primary" disabled={saving} onClick={submit}>
        {zh ? '提交评价' : 'Submit evaluation'}</button>
    </section>
  </div>;
}
