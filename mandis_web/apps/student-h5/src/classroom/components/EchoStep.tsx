import { useEffect, useState } from 'react';
import type { EchoResult, Locale } from '@mandis/common/classroom-types';
import { CourseProgress } from './CourseProgress';

const ECHO_POLL_MS = 5000;

type Props = {
  locale: Locale;
  pendingArtwork: boolean;
  classroomCode?: string;
  loadEcho: () => Promise<EchoResult>;
  onFeedback: (input: Record<string, unknown>) => Promise<void>;
};

export function EchoStep({ locale, pendingArtwork, classroomCode, loadEcho, onFeedback }: Props) {
  const zh = locale === 'zh-CN';
  const [echo, setEcho] = useState<EchoResult | null>(null);
  const [fit, setFit] = useState('unsure');
  const [comment, setComment] = useState('');
  const [allowCommentUse, setAllowCommentUse] = useState(false);
  const [allowArtworkUse, setAllowArtworkUse] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      void loadEcho().then((value) => {
        if (active) setEcho(value);
      });
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

  return (
    <main className="course-step-screen">
      <CourseProgress locale={locale} currentStep={5} pendingArtwork={pendingArtwork} />
      <section className="classroom-card echo-card">
        <p className="classroom-eyebrow">{zh ? '第 5 步 · 作品回响' : 'STEP 5 · REFLECTION'}</p>
        {pendingArtwork && !echo?.coverUrl ? (
          <div className="pending-artwork">
            <h1>{zh ? '等待教师补充作品' : 'Waiting for the teacher upload'}</h1>
            <p>
              {zh
                ? '请把下面的匿名课堂编号告诉教师。编号不包含姓名或学号。'
                : 'Give this anonymous code to your teacher. It contains no name or student ID.'}
            </p>
            <strong>{classroomCode}</strong>
          </div>
        ) : (
          <div className="echo-result">
            {echo?.coverUrl && <img src={echo.coverUrl} alt={zh ? '课堂作品' : 'Classroom artwork'} />}
            {echo?.status === 'success' ? (
              <>
                <h1>{zh ? '作品中的颜色与线条' : 'Colour and line in your artwork'}</h1>
                <p>{echo.colorAnalysis}</p>
                <p>{echo.summary}</p>
                {echo.suggestion && <aside>{echo.suggestion}</aside>}
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
