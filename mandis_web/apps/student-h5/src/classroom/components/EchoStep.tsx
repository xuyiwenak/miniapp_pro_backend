import { useEffect, useRef, useState } from 'react';
import type {
  ClassroomInfo, EchoResult, Locale, ParticipationState, IntentionInput, EvaluationInput,
} from '@mandis/common/classroom-types';
import { SessionReview, AiContent } from './SessionReview';
import { UpOutlined, DownOutlined, BookOutlined, RightOutlined, CopyOutlined } from '@ant-design/icons';
import { EvaluationForm } from './ReflectionForms';
import { IntentionForm } from './IntentionWizard';
import { EMOTION_OPTIONS } from '@mandis/common/classroom-types';

const POLL_INTERVAL_MS = 5000;
type Props = {
  locale: Locale; classroom: ClassroomInfo; participation: ParticipationState; completed?: boolean;
  loadEcho: () => Promise<EchoResult>; loadArtwork: () => Promise<EchoResult>; onReviseArtwork: () => void; onComplete: () => Promise<void>;
  onFeedback: (input: EvaluationInput) => Promise<void>;
  onIntention: (input: IntentionInput, submit: boolean) => Promise<void>;
  onDraft: (input: EvaluationInput) => Promise<void>; onViewed: (runId: string) => Promise<void>;
  onRecovery: () => Promise<string>;
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
  const [evaluating, setEvaluating] = useState(() => participation.evaluation?.status !== 'submitted');
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
    try { await props.onViewed(echo.analysisRunId); setHidden(false); setEvaluating(true); }
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
  return <main className="classroom-card classroom-redesign echo-redesign">
    {readOnly && <p role="status">{zh ? '课堂已封存，仅可查看。未完成的环节已如实记录。'
      : 'This classroom is sealed. Your saved records are read-only.'}</p>}
    {!readOnly && (participation.intention?.status !== 'submitted' || revising) && <IntentionForm
      locale={locale} saved={participation.intention}
      cacheKey={`intention:${participation.participantId}:${revising ? participation.intention?.revision : 'draft'}`}
      onSave={async (input, submit) => { await props.onIntention(input, submit); if (submit) setRevising(false); }} />}
    <ReportPanel props={props} state={state} />
    <p role="alert">{error || notice}</p>
    <ReturnControls state={state} />
  </main>;
}

function ReportPanel({ props, state }: { props: Props; state: StepState }) {
  const { locale, participation, zh, readOnly, echo, evaluating, beginEvaluation } = state;
  if (!readOnly && participation.intention?.status !== 'submitted') return null;
  return <>
    <ReportReader props={props} state={state} />
    {!readOnly && !participation.artworkId && <button type="button" className="reflection-text-button"
      onClick={props.onReviseArtwork}>{zh ? '补充上传作品' : 'Upload artwork'}</button>}
    {!readOnly && echo?.status === 'success' && !evaluating && <div className="echo-evaluation-action">
      <button type="button" className="classroom-primary" onClick={() => void beginEvaluation()}>
        {participation.evaluation?.status === 'submitted' ? (zh ? '修改我的评价' : 'Edit my response')
          : (zh ? '评价这份回响' : 'Respond to this reflection')}</button>
      <p>{zh ? '你的评价不会改变这份回响。' : 'Your response will not change this reflection.'}</p>
    </div>}
    <div className="echo-saved-records"><SavedIntention state={state} /><SavedEvaluation state={state} />
      <details><summary>{zh ? '活动前后的自评记录' : 'Your before and after records'}</summary>
        <SessionReview locale={locale} classroom={state.classroom} participation={participation}
          echo={null} waitExpired={false} statusQueryFailed={false} assessmentsOnly />
      </details>
    </div>
  </>;
}
function ReportReader({ props, state }: { props: Props; state: StepState }) {
  const { zh, participation, echo, error, hidden, evaluating, setEvaluating, setHidden } = state;
  const permitted = participation.allowPrivateAi && participation.intention?.status === 'submitted';
  return <section className="echo-reader">
    <p className="redesign-step">{zh ? '作品回响 · 阅读与评价' : 'Artwork reflection · Read and respond'}</p>
    <h1>{zh ? '看看 AI 如何理解你的作品' : 'See how AI interprets your artwork'}</h1>
    <p className="redesign-intro">{zh ? '这是一种解读，你的感受同样重要。' : 'One interpretation. Your own feelings matter.'}</p>
    {echo?.coverUrl && <div className="echo-artwork"><img src={echo.coverUrl} alt={zh ? '我的作品' : 'My artwork'} />
      <div><strong>{zh ? '我的作品' : 'My artwork'}</strong><span>{state.classroom.activityTheme}</span></div></div>}
    {permitted ? <>
      <button type="button" className="echo-disclosure" aria-expanded={!hidden} aria-controls="ai-reflection-content"
        onClick={() => setHidden(!hidden)}><strong>{zh ? 'AI 回响' : 'AI reflection'}</strong>
        <span>{hidden ? (zh ? '展开' : 'Expand') : (zh ? '收起' : 'Collapse')}
          {hidden ? <DownOutlined aria-hidden /> : <UpOutlined aria-hidden />}</span></button>
      <div id="ai-reflection-content" hidden={hidden}>
        {evaluating && echo ? <EvaluationForm locale={state.locale} echo={echo}
          saved={participation.evaluation} cacheKey={`evaluation:${participation.participantId}:${echo.analysisRunId}`}
          onSave={async (input, submit) => {
            if (submit) { await props.onFeedback(input); setEvaluating(false); }
            else await props.onDraft(input);
          }} /> : <AiContent echo={echo} zh={zh} waitExpired={false} failed={Boolean(error)}
          hasArtwork={Boolean(participation.artworkId)} />}
        <p className="echo-boundary">{zh ? 'AI 解读仅供参考，不用于心理诊断或课程评分。'
          : 'AI interpretation is for reflection, not diagnosis or grading.'}</p>
        <button className="reflection-text-button echo-collapse" type="button" onClick={() => setHidden(true)}>
          {zh ? '收起回响' : 'Collapse reflection'}<UpOutlined aria-hidden /></button>
      </div>
    </> : <p>{zh ? '这份回响暂不可查看，你已保存的记录仍可查看。'
      : 'This reflection is unavailable. Your saved records remain accessible.'}</p>}
  </section>;
}
function SavedIntention({ state }: { state: StepState }) {
  const { participation, zh, readOnly, setRevising } = state;
  return <>
      {participation.intention && <details><summary>{zh ? '我的表达意图' : 'My intention'}</summary>
        <p>{participation.intention.intendedEmotions.map((code) =>
          EMOTION_OPTIONS.find(([value]) => value === code)?.[zh ? 1 : 2] ?? code).join(' · ')}</p>
        <p>{participation.intention.intentionText}</p>
        {!readOnly && <button type="button" onClick={() => setRevising(true)}>
          {zh ? '修改表达意图' : 'Edit intention'}</button>}
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
function ReturnControls({ state }: { state: StepState }) {
  const { participation, zh, readOnly, returnUrl, saveReturn } = state;
  const [copyMessage, setCopyMessage] = useState('');
  async function copyLink() {
    try { await navigator.clipboard.writeText(returnUrl); setCopyMessage(zh ? '已复制' : 'Copied'); }
    catch { setCopyMessage(zh ? '请长按下方链接复制或收藏。' : 'Press and hold the link to copy or bookmark it.'); }
  }
  if (readOnly) return null;
  return <div className="echo-return">
    <button className="echo-return__entry" type="button" onClick={() => returnUrl ? void copyLink() : void saveReturn()}>
      <BookOutlined aria-hidden /><span><strong>{zh ? '保存返回入口' : 'Save your return link'}</strong>
        <small>{zh ? '稍后回来，继续查看或评价' : 'Return later to view or respond'}</small></span><RightOutlined aria-hidden />
    </button>
    {returnUrl && <div className="echo-return__link">
      <button type="button" className="reflection-text-button" onClick={() => void copyLink()}>
        <CopyOutlined aria-hidden />{zh ? '复制个人链接' : 'Copy personal link'}</button>
      <a href={returnUrl}>{zh ? '个人返回链接（仅自己保存）' : 'Personal return link — keep private'}</a>
      <p role="status">{copyMessage}</p>
    </div>}
    {participation.gracePeriodEndsAt && <p className="echo-deadline">{zh ? '可补充至：' : 'Available until: '}
      {new Date(participation.gracePeriodEndsAt).toLocaleString()}</p>}
  </div>;
}
