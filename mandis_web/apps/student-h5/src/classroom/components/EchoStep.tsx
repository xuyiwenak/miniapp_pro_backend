import { useEffect, useRef, useState } from 'react';
import type {
  ClassroomInfo,
  EchoResult,
  Locale,
  ParticipationState,
} from '@mandis/common/classroom-types';
import { CourseProgress } from './CourseProgress';
import { SessionReview } from './SessionReview';

const ECHO_POLL_MS = 5000;
const ECHO_WAIT_TIMEOUT_MS = 120_000;
const QUERY_FAILURE_LIMIT = 3;

type Props = {
  locale: Locale;
  classroom: ClassroomInfo;
  participation: ParticipationState;
  completed?: boolean;
  loadEcho: () => Promise<EchoResult>;
  onReviseArtwork: () => void;
  onComplete: () => Promise<void>;
  onFeedback: (input: Record<string, unknown>) => Promise<void>;
};

function useEchoStatus(loadEcho: () => Promise<EchoResult>, shouldPoll: boolean) {
  const [echo, setEcho] = useState<EchoResult | null>(null);
  const [statusQueryFailed, setStatusQueryFailed] = useState(false);
  const failureCount = useRef(0);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let loading = false;
    const schedule = () => {
      if (active && shouldPoll) timer = window.setTimeout(load, ECHO_POLL_MS);
    };
    const load = async (): Promise<void> => {
      timer = undefined;
      if (!active || loading || document.visibilityState !== 'visible') return;
      loading = true;
      try {
        const value = await loadEcho();
        if (!active) return;
        failureCount.current = 0;
        setStatusQueryFailed(false);
        setEcho(value);
        if (value.status === 'none' || value.status === 'pending') schedule();
      } catch {
        if (!active) return;
        failureCount.current += 1;
        setStatusQueryFailed(failureCount.current >= QUERY_FAILURE_LIMIT);
        schedule();
      } finally {
        loading = false;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        window.clearTimeout(timer);
        timer = undefined;
      }
      if (document.visibilityState === 'visible' && timer === undefined) void load();
    };
    void load();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadEcho, shouldPoll]);

  return { echo, statusQueryFailed };
}

function useWaitExpiry(hasArtwork: boolean, echo: EchoResult | null): boolean {
  const [waitExpired, setWaitExpired] = useState(false);
  const terminal = echo?.status === 'success' || echo?.status === 'failed';
  useEffect(() => {
    if (!hasArtwork || terminal) return;
    const timer = window.setTimeout(() => setWaitExpired(true), ECHO_WAIT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [hasArtwork, terminal]);
  return waitExpired;
}

function FeedbackFit({ fit, locale, onChange }: {
  fit: string;
  locale: Locale;
  onChange: (value: string) => void;
}) {
  const zh = locale === 'zh-CN';
  const options = [
    ['mostly', zh ? '比较贴合' : 'Mostly fitting'],
    ['partly', zh ? '部分贴合' : 'Partly fitting'],
    ['not_really', zh ? '不太贴合' : 'Not really fitting'],
    ['unsure', zh ? '不确定' : 'Unsure'],
  ];
  return (
    <fieldset className="feedback-fit">
      <legend>{zh ? '这份回响与你的感受：' : 'This reflection feels:'}</legend>
      {options.map(([value, label]) => (
        <label key={value}>
          <input type="radio" name="fit" checked={fit === value} onChange={() => onChange(value)} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function FeedbackConsent({ checked, children, onChange }: {
  checked: boolean;
  children: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="feedback-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {children}
    </label>
  );
}

function FeedbackForm({ locale, saving, onSubmit }: {
  locale: Locale;
  saving: boolean;
  onSubmit: (input: Record<string, unknown>) => Promise<void>;
}) {
  const zh = locale === 'zh-CN';
  const [fit, setFit] = useState('unsure');
  const [comment, setComment] = useState('');
  const [allowCommentUse, setAllowCommentUse] = useState(false);
  const [allowArtworkUse, setAllowArtworkUse] = useState(false);
  const submit = () => onSubmit({ fit, comment: comment.trim() || undefined, allowCommentUse, allowArtworkUse });
  return (
    <div className="review-feedback">
      <FeedbackFit fit={fit} locale={locale} onChange={setFit} />
      <label className="feedback-comment">
        {zh ? '自愿写下一句感受' : 'Optional comment'}
        <textarea maxLength={300} value={comment} onChange={(event) => setComment(event.target.value)} />
      </label>
      <FeedbackConsent checked={allowCommentUse} onChange={setAllowCommentUse}>
        {zh ? '同意将这段感受去标识化后用于论文或非商业教学展示'
          : 'Allow this de-identified comment in research or non-commercial teaching'}
      </FeedbackConsent>
      <FeedbackConsent checked={allowArtworkUse} onChange={setAllowArtworkUse}>
        {zh ? '同意将作品图片去标识化后用于论文、会议或非商业教学展示'
          : 'Allow this de-identified artwork in papers, conferences or non-commercial teaching'}
      </FeedbackConsent>
      <button className="classroom-primary" type="button" disabled={saving} onClick={() => void submit()}>
        {zh ? '提交反馈并完成' : 'Submit feedback and finish'}
      </button>
    </div>
  );
}

export function EchoStep({
  locale,
  classroom,
  participation,
  completed = false,
  loadEcho,
  onReviseArtwork,
  onComplete,
  onFeedback,
}: Props) {
  const zh = locale === 'zh-CN';
  const hasArtwork = Boolean(participation.artworkId);
  const waitingForTeacher = participation.artworkStatus === 'teacher_upload_pending';
  const shouldPoll = hasArtwork || (!completed && waitingForTeacher);
  const { echo, statusQueryFailed } = useEchoStatus(loadEcho, shouldPoll);
  const hasEchoArtwork = hasArtwork || Boolean(echo?.coverUrl);
  const waitExpired = useWaitExpiry(hasEchoArtwork, echo);
  const [saving, setSaving] = useState(false);
  const echoReady = echo?.status === 'success';
  const canFinish = !hasEchoArtwork || echo?.status === 'failed' || waitExpired || statusQueryFailed;

  async function run(action: () => Promise<void>): Promise<void> {
    setSaving(true);
    try {
      await action();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="course-step-screen">
      <CourseProgress
        locale={locale}
        currentStep={5}
        completed={completed}
        pendingArtwork={!hasEchoArtwork}
        failedStep={echo?.status === 'failed' || statusQueryFailed ? 5 : undefined}
        onStepSelect={!hasEchoArtwork ? onReviseArtwork : undefined}
      />
      <SessionReview
        locale={locale}
        classroom={classroom}
        participation={participation}
        echo={echo}
        initialPage={completed ? 1 : 4}
        waitExpired={waitExpired}
        statusQueryFailed={statusQueryFailed}
      />
      {completed && (
        <p className="review-complete-note">
          {zh ? '本次课堂已完成。你仍可以翻页查看并逐页截图保存。'
            : 'This session is complete. You can still browse and screenshot each page.'}
        </p>
      )}
      {!completed && !hasEchoArtwork && (
        <div className="echo-actions">
          <button className="classroom-primary" type="button" disabled={saving} onClick={onReviseArtwork}>
            {zh ? '自己上传作品' : 'Upload artwork myself'}
          </button>
          <button className="classroom-secondary" type="button" disabled={saving}
            onClick={() => void run(onComplete)}>
            {zh ? '暂不上传，完成课堂' : 'Finish without uploading'}
          </button>
        </div>
      )}
      {!completed && hasEchoArtwork && !echoReady && canFinish && (
        <div className="echo-actions">
          <button className="classroom-secondary" type="button" disabled={saving}
            onClick={() => void run(onComplete)}>
            {zh ? '稍后再看，先完成课堂' : 'Finish and view this later'}
          </button>
        </div>
      )}
      {!completed && echoReady && (
        <FeedbackForm locale={locale} saving={saving} onSubmit={(input) => run(() => onFeedback(input))} />
      )}
    </main>
  );
}
