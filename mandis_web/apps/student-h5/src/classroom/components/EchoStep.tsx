import { useEffect, useRef, useState } from 'react';
import type {
  ClassroomInfo, EchoResult, Locale, ParticipationState, IntentionInput, EvaluationInput,
} from '@mandis/common/classroom-types';
import { SessionReview } from './SessionReview';
import { IntentionForm, EvaluationForm } from './ReflectionForms';

const POLL_INTERVAL_MS = 5000;
type Props = {
  locale: Locale; classroom: ClassroomInfo; participation: ParticipationState; completed?: boolean;
  loadEcho: () => Promise<EchoResult>; loadArtwork: () => Promise<EchoResult>; onReviseArtwork: () => void; onComplete: () => Promise<void>;
  onFeedback: (input: EvaluationInput) => Promise<void>;
  onIntention: (input: IntentionInput, submit: boolean) => Promise<void>;
  onDraft: (input: EvaluationInput) => Promise<void>; onViewed: (runId: string) => Promise<void>;
  onRecovery: () => Promise<string>;
  onConsent: (ai: boolean, text: boolean) => Promise<void>;
};
function useReport(props: Props, allowed: boolean) {
  const [echo, setEcho] = useState<EchoResult | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let timer: number;
    async function fetchReport() {
      try {
        const result = await (allowed ? props.loadEcho() : props.loadArtwork());
        if (!active) return;
        setEcho(result); setError('');
        if (allowed && result.status !== 'success' && !props.participation.readOnly) {
          timer = window.setTimeout(() => void fetchReport(), POLL_INTERVAL_MS);
        }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Unable to load reflection');
      }
    }
    void fetchReport();
    return () => { active = false; window.clearTimeout(timer); };
  }, [allowed, props.loadEcho, props.loadArtwork, props.participation.readOnly]);
  return { echo, error };
}
function useEchoStep(props: Props) {
  const { locale, classroom, participation } = props;
  const zh = locale === 'zh-CN';
  const readOnly = Boolean(participation.readOnly);
  const allowed = Boolean(participation.allowPrivateAi && participation.intention?.status === 'submitted'
    && participation.postAssessment.status === 'submitted');
  const { echo, error } = useReport(props, allowed);
  const [returnUrl, setReturnUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [hidden, setHidden] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [revising, setRevising] = useState(false);
  const exposure = useRef('');
  useEffect(() => {
    const runId = echo?.analysisRunId;
    if (readOnly || hidden || !runId || exposure.current === runId) return;
    exposure.current = runId;
    void props.onViewed(runId).catch(() => { exposure.current = ''; });
  }, [echo?.analysisRunId, readOnly, hidden, props.onViewed]);
  async function beginEvaluation() {
    if (!echo?.analysisRunId) return;
    try { await props.onViewed(echo.analysisRunId); setEvaluating(true); }
    catch (failure) { setNotice(failure instanceof Error ? failure.message : 'Unable to continue'); }
  }
  async function saveReturn() {
    try { setReturnUrl(await props.onRecovery()); }
    catch (failure) { setNotice(failure instanceof Error ? failure.message : 'Unable to create link'); }
  }
  return { locale, classroom, participation, zh, readOnly, echo, error, returnUrl, notice, hidden,
    evaluating, revising, setRevising, setEvaluating, setHidden, setNotice, beginEvaluation, saveReturn };
}
type StepState = ReturnType<typeof useEchoStep>;
export function EchoStep(props: Props) {
  const state = useEchoStep(props);
  const { locale, participation, zh, readOnly, revising, setRevising, error, notice } = state;
  return <main className="classroom-card">
    {readOnly && <p role="status">{zh ? '课堂已封存，仅可查看。未完成的环节已如实记录。'
      : 'This classroom is sealed. Your saved records are read-only.'}</p>}
    {!readOnly && (participation.intention?.status !== 'submitted' || revising) && <IntentionForm
      locale={locale} saved={participation.intention}
      cacheKey={`intention:${participation.participantId}:${revising ? participation.intention?.revision : 'draft'}`}
      onSave={async (input, submit) => { await props.onIntention(input, submit); if (submit) setRevising(false); }} />}
    <ReportPanel props={props} state={state} />
    <p role="alert">{error || notice}</p>
    <ReturnControls props={props} state={state} />
  </main>;
}

function ReportPanel({ props, state }: { props: Props; state: StepState }) {
  const { locale, classroom, participation, zh, readOnly, echo, error, hidden, evaluating,
    setHidden, setEvaluating, beginEvaluation } = state;
  return <>
    {(readOnly || participation.intention?.status === 'submitted') && <>
      <SavedIntention state={state} />
      {!participation.allowPrivateAi && <p>{zh ? '你未授权私人 AI 分析。已有记录已保存，本次流程尚不完整。'
        : 'AI analysis is not authorised. Saved records are retained; the full flow is incomplete.'}</p>}
      {!hidden && <SessionReview locale={locale} classroom={classroom} participation={participation}
        echo={echo} initialPage={readOnly ? 1 : 4} waitExpired={false} statusQueryFailed={Boolean(error)} />}
      {echo?.status === 'success' && <button type="button" className="classroom-secondary"
        onClick={() => setHidden(!hidden)}>{hidden ? (zh ? '显示回响' : 'Show reflection')
          : (zh ? '隐藏回响' : 'Hide reflection')}</button>}
      {!readOnly && !participation.artworkId && <button type="button" onClick={props.onReviseArtwork}>
        {zh ? '补充上传作品' : 'Upload artwork'}</button>}
      {!readOnly && echo?.status === 'success' && !evaluating && <button type="button"
        className="classroom-primary" onClick={() => void beginEvaluation()}>
      {participation.evaluation?.status === 'submitted' ? (zh ? '修订评价（保留首次记录）' : 'Revise evaluation')
          : (zh ? '我已阅读，评价这份回响' : 'I have read this reflection — respond')}</button>}
      {!readOnly && evaluating && echo && <EvaluationForm locale={locale} echo={echo}
        saved={participation.evaluation} cacheKey={`evaluation:${participation.participantId}:${echo.analysisRunId}`}
        onSave={async (input, submit) => {
          if (submit) { await props.onFeedback(input); setEvaluating(false); }
          else await props.onDraft(input);
        }} />}
      <SavedEvaluation state={state} />
    </>}
  </>;
}
function SavedIntention({ state }: { state: StepState }) {
  const { participation, zh, readOnly, setRevising } = state;
  return <>
      {participation.intention && <details><summary>{zh ? '我的表达意图' : 'My intention'}</summary>
        <p>VAD: {participation.intention.intendedValence ?? '—'} / {participation.intention.intendedArousal ?? '—'}
          / {participation.intention.intendedDominance ?? '—'}</p>
        <p>{participation.intention.intentionText}</p>
        {!readOnly && <button type="button" onClick={() => setRevising(true)}>
          {zh ? '补充修订（保留首次记录）' : 'Revise (first submission preserved)'}</button>}
      </details>}
  </>;
}
function SavedEvaluation({ state }: { state: StepState }) {
  const { participation, zh } = state;
  return <>
      {participation.evaluation?.status === 'submitted' && <details><summary>{zh ? '已保存的评价' : 'Saved evaluation'}</summary>
        <p>{zh ? '总体帮助 / 反思帮助 / 不适' : 'Helpful / Reflection / Discomfort'}:
          {participation.evaluation.feedbackOverallHelpful} / {participation.evaluation.feedbackReflectionHelp}
          / {participation.evaluation.feedbackDiscomfort}</p><p>{participation.evaluation.overallComment}</p>
      </details>}
  </>;
}
function ReturnControls({ props, state }: { props: Props; state: StepState }) {
  const { participation, zh, readOnly, returnUrl, setNotice, saveReturn } = state;
  return <>
    {!readOnly && <><details><summary>{zh ? 'AI 与研究授权' : 'AI and research consent'}</summary>
      <label><input type="checkbox" checked={Boolean(participation.allowPrivateAi)}
        onChange={(event) => void props.onConsent(event.target.checked, Boolean(participation.allowSensitiveText))
          .catch((failure) => setNotice(String(failure)))} />
        {zh ? '允许私人 AI 分析（撤回后不再展示回响）' : 'Allow private AI analysis'}</label>
      <label><input type="checkbox" checked={Boolean(participation.allowSensitiveText)}
        onChange={(event) => void props.onConsent(Boolean(participation.allowPrivateAi), event.target.checked)
          .catch((failure) => setNotice(String(failure)))} />
        {zh ? '允许敏感文本研究使用' : 'Allow research use of text'}</label>
    </details><p>{zh ? '可暂时离开，重新扫码后继续。仅完成全部必需环节才计为完整记录。'
      : 'You may leave and scan again to continue. Only complete submissions count as complete records.'}</p>
      {participation.gracePeriodEndsAt && <p>{zh ? '补充截止：' : 'Deadline: '}
        {new Date(participation.gracePeriodEndsAt).toLocaleString()}</p>}
      <button type="button" className="classroom-secondary" onClick={() => void saveReturn()}>
        {zh ? '保存个人返回入口' : 'Save a personal return link'}</button>
      {returnUrl && <label>{zh ? '仅自己保存；重新生成会使旧入口失效。' : 'Keep private. Generating again replaces the old link.'}
        <input readOnly value={returnUrl} onFocus={(event) => event.target.select()} /></label>}
    </>}
  </>;
}
