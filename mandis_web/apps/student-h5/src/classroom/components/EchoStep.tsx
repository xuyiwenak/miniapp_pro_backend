import { useEffect, useState } from 'react';
import type { EchoResult, Locale } from '@mandis/common/classroom-types';
import { CourseProgress } from './CourseProgress';

const ECHO_POLL_MS = 5000;

type Props = {
  locale: Locale;
  pendingArtwork: boolean;
  classroomCode?: string;
  loadEcho: () => Promise<EchoResult>;
  onReviseArtwork: () => void;
  onComplete: () => Promise<void>;
  onFeedback: (input: Record<string, unknown>) => Promise<void>;
};

export function EchoStep({
  locale,
  pendingArtwork,
  classroomCode,
  loadEcho,
  onReviseArtwork,
  onComplete,
  onFeedback,
}: Props) {
  const zh = locale === 'zh-CN';
  const [echo, setEcho] = useState<EchoResult | null>(null);
  const [fit, setFit] = useState('unsure');
  const [comment, setComment] = useState('');
  const [allowCommentUse, setAllowCommentUse] = useState(false);
  const [allowArtworkUse, setAllowArtworkUse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => {
      void loadEcho()
        .then((value) => {
          if (!active) return;
          setEcho(value);
          setLoadFailed(false);
        })
        .catch(() => {
          if (active) setLoadFailed(true);
        });
    };
    load();
    const timer = window.setInterval(load, ECHO_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadEcho]);

  async function submitFeedback(): Promise<void> {
    setSaving(true);
    try {
      await onFeedback({ fit, comment: comment.trim() || undefined, allowCommentUse, allowArtworkUse });
    } finally {
      setSaving(false);
    }
  }

  async function completeWithoutEcho(): Promise<void> {
    setSaving(true);
    try {
      await onComplete();
    } finally {
      setSaving(false);
    }
  }

  const echoReady = echo?.status === 'success';
  const artworkStillPending = pendingArtwork && !echo?.coverUrl;
  const echoFailed = loadFailed || echo?.status === 'failed';

  return (
    <main className="course-step-screen">
      <CourseProgress
        locale={locale}
        currentStep={5}
        pendingArtwork={artworkStillPending}
        failedStep={echoFailed ? 5 : undefined}
        onStepSelect={artworkStillPending ? onReviseArtwork : undefined}
      />
      <section className="classroom-card echo-card">
        <p className="classroom-eyebrow">{zh ? '第 5 步 · 作品回响' : 'STEP 5 · REFLECTION'}</p>
        {artworkStillPending ? (
          <div className="pending-artwork">
            <h1>{zh ? '作品还没有上传' : 'The artwork has not been uploaded'}</h1>
            <p>
              {zh
                ? '你可以现在自己上传，也可以先完成课堂。教师之后仍可使用匿名编号补充作品。'
                : 'Upload it yourself now or finish the class first. Your teacher can still add it later.'}
            </p>
            <strong>{classroomCode}</strong>
          </div>
        ) : (
          <div className="echo-result">
            {echo?.coverUrl && <img src={echo.coverUrl} alt={zh ? '课堂作品' : 'Classroom artwork'} />}
            {echoReady ? (
              <>
                <h1>{zh ? '作品中的颜色与线条' : 'Colour and line in your artwork'}</h1>
                <p>{echo.colorAnalysis}</p>
                <p>{echo.summary}</p>
                {echo.suggestion && <aside>{echo.suggestion}</aside>}
              </>
            ) : echoFailed ? (
              <>
                <h1>{zh ? '作品回响暂时生成失败' : 'Reflection generation failed'}</h1>
                <p>
                  {zh
                    ? '作品和测评数据已经保留，请稍后重新扫码查看，或请教师处理 AI 失败告警。'
                    : 'Your artwork and assessments are saved. Scan again later or ask the teacher to review the alert.'}
                </p>
              </>
            ) : (
              <>
                <h1>{zh ? '正在整理作品回响' : 'Preparing your artwork reflection'}</h1>
                <p>
                  {zh
                    ? '系统正在整理可复核的颜色、线条和构图观察。你可以稍后重新扫码查看。'
                    : 'The system is organising observable colour, line and composition details. You may scan again later.'}
                </p>
              </>
            )}
          </div>
        )}
        <div className="echo-boundary">
          {zh
            ? '学生自评是主要证据，AI仅作辅助整理，不用于心理诊断或课程评分。'
            : 'Your self-report is primary. AI only assists organisation and is not used for diagnosis or grading.'}
        </div>
        {!echoReady && (
          <div className="echo-actions">
            {artworkStillPending && (
              <button className="classroom-primary" type="button" disabled={saving} onClick={onReviseArtwork}>
                {zh ? '自己上传作品' : 'Upload artwork myself'}
              </button>
            )}
            <button
              className={artworkStillPending ? 'classroom-secondary' : 'classroom-primary'}
              type="button"
              disabled={saving}
              onClick={() => {
                void completeWithoutEcho();
              }}
            >
              {artworkStillPending
                ? zh
                  ? '暂不上传，完成课堂'
                  : 'Finish without uploading'
                : zh
                ? '先完成课堂'
                : 'Finish class now'}
            </button>
          </div>
        )}
        {echoReady && (
          <>
            <fieldset className="feedback-fit">
              <legend>{zh ? '这份回响与你的感受：' : 'This reflection feels:'}</legend>
              {[
                ['mostly', zh ? '比较贴合' : 'Mostly fitting'],
                ['partly', zh ? '部分贴合' : 'Partly fitting'],
                ['not_really', zh ? '不太贴合' : 'Not really fitting'],
                ['unsure', zh ? '不确定' : 'Unsure'],
              ].map(([value, label]) => (
                <label key={value}>
                  <input type="radio" name="fit" checked={fit === value} onChange={() => setFit(value)} />
                  {label}
                </label>
              ))}
            </fieldset>
            <label className="feedback-comment">
              {zh ? '自愿写下一句感受' : 'Optional comment'}
              <textarea maxLength={300} value={comment} onChange={(event) => setComment(event.target.value)} />
            </label>
            <label className="feedback-check">
              <input
                type="checkbox"
                checked={allowCommentUse}
                onChange={(event) => setAllowCommentUse(event.target.checked)}
              />
              {zh
                ? '同意将这段感受去标识化后用于论文或非商业教学展示'
                : 'Allow this de-identified comment in research or non-commercial teaching'}
            </label>
            <label className="feedback-check">
              <input
                type="checkbox"
                checked={allowArtworkUse}
                onChange={(event) => setAllowArtworkUse(event.target.checked)}
              />
              {zh
                ? '同意将作品图片去标识化后用于论文、会议或非商业教学展示'
                : 'Allow this de-identified artwork in papers, conferences or non-commercial teaching'}
            </label>
            <button
              className="classroom-primary"
              type="button"
              disabled={saving}
              onClick={() => {
                void submitFeedback();
              }}
            >
              {zh ? '提交并完成' : 'Submit and finish'}
            </button>
          </>
        )}
      </section>
    </main>
  );
}

export function CompleteStep({ locale, researchComplete }: { locale: Locale; researchComplete: boolean }) {
  const zh = locale === 'zh-CN';
  return (
    <main className="course-step-screen">
      <CourseProgress locale={locale} currentStep={5} completed />
      <section className="classroom-card complete-card">
        <span className="complete-mark" aria-hidden="true">
          ✓
        </span>
        <h1>{zh ? '本次课堂流程已完成' : 'Session complete'}</h1>
        <p>
          {researchComplete
            ? zh
              ? '前后测与作品已经完整保存。感谢你的参与。'
              : 'Your assessments and artwork are saved. Thank you for participating.'
            : zh
            ? '你的课堂操作已经完成；部分研究资料仍可能等待教师补充。'
            : 'Your steps are complete; some research data may still await a teacher upload.'}
        </p>
      </section>
    </main>
  );
}
