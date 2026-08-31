import { useMemo, useRef, useState } from 'react';
import { PANAS_ITEMS, VAD_ITEMS } from '@mandis/common/classroom-copy';
import type {
  AssessmentAnswers,
  AssessmentRecord,
  Locale,
} from '@mandis/common/classroom-types';
import { clearAssessmentDraft, loadAssessmentDraft, saveAssessmentDraft } from '../storage';
import { CourseProgress } from './CourseProgress';
import { VAD_ASSETS, type VadDimension } from './vadAssets';

const FIRST_PANAS_INDEX = 0;
const SECOND_PANAS_INDEX = 5;
const PANAS_PAGE_SIZE = 5;
const SWIPE_THRESHOLD_PX = 48;

type Props = {
  accessCode: string;
  locale: Locale;
  timepoint: 'pre' | 'post';
  saved: AssessmentRecord;
  pendingArtwork?: boolean;
  onDraft: (page: number, answers: AssessmentAnswers, clientRecovered: boolean) => Promise<void>;
  onSubmit: (page: number, answers: AssessmentAnswers, durationMs: number, clientRecovered: boolean) => Promise<void>;
};

function initialAnswers(saved: AssessmentRecord, local: ReturnType<typeof loadAssessmentDraft>): AssessmentAnswers {
  if (local) return local.answers;
  return { vad: saved.vad ?? {}, panas: saved.panas ?? {} };
}

function getVadInstruction(dimension: VadDimension, zh: boolean): string | undefined {
  if (dimension !== 'valence') return undefined;
  return zh ? '选择最接近此刻感受的表情或数字' : 'Choose the face or number closest to how you feel';
}

function getVadMiddleLabel(dimension: VadDimension, zh: boolean): string {
  if (dimension === 'arousal') return '';
  return zh ? '一般' : 'Neutral';
}

function VadQuestion({
  item,
  locale,
  value,
  onChange,
}: {
  item: (typeof VAD_ITEMS)[number];
  locale: Locale;
  value?: number;
  onChange: (value: number) => void;
}) {
  const zh = locale === 'zh-CN';
  const title = zh ? item.zh : item.en;
  const dimension = item.code as VadDimension;
  const instruction = getVadInstruction(dimension, zh);
  const middleLabel = getVadMiddleLabel(dimension, zh);
  return (
    <fieldset className={`vad-question vad-question--${dimension}`}>
      <legend>
        <strong>{title}</strong>
        <span>{zh ? item.zhHelp : item.enHelp}</span>
        {instruction && <span className="vad-instruction">{instruction}</span>}
      </legend>
      <div className="vad-options" role="radiogroup" aria-label={title}>
        {Array.from({ length: 9 }, (_, index) => index + 1).map((score) => (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={value === score}
            aria-label={`${title} ${score}`}
            className={value === score ? 'is-selected' : ''}
            onClick={() => onChange(score)}
          >
            <img src={VAD_ASSETS[dimension][score - 1]} alt="" />
            <span className="vad-score">{score}</span>
          </button>
        ))}
      </div>
      <div className="rating-anchors">
        <span>{zh ? item.zhLow : item.enLow}</span>
        <span>{middleLabel}</span>
        <span>{zh ? item.zhHigh : item.enHigh}</span>
      </div>
    </fieldset>
  );
}

function PanasQuestion({
  item,
  locale,
  value,
  onChange,
}: {
  item: (typeof PANAS_ITEMS)[number];
  locale: Locale;
  value?: number;
  onChange: (value: number) => void;
}) {
  const label = locale === 'zh-CN' ? item.zh : item.en;
  return (
    <fieldset className="panas-question">
      <legend>{label}</legend>
      <div role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={value === score}
            className={value === score ? 'is-selected' : ''}
            onClick={() => onChange(score)}
          >
            {score}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function isPageComplete(page: number, answers: AssessmentAnswers): boolean {
  if (page === 1) return VAD_ITEMS.every((item) => answers.vad[item.code] !== undefined);
  const start = page === 2 ? FIRST_PANAS_INDEX : SECOND_PANAS_INDEX;
  return PANAS_ITEMS.slice(start, start + PANAS_PAGE_SIZE).every((item) => answers.panas[item.code] !== undefined);
}

export function AssessmentStep({
  accessCode,
  locale,
  timepoint,
  saved,
  pendingArtwork = false,
  onDraft,
  onSubmit,
}: Props) {
  const localDraft = useMemo(() => loadAssessmentDraft(accessCode, timepoint), [accessCode, timepoint]);
  const [page, setPage] = useState<1 | 2 | 3>(localDraft?.page ?? saved.currentPage ?? 1);
  const [answers, setAnswers] = useState(() => initialAnswers(saved, localDraft));
  const [message, setMessage] = useState('');
  const [operationFailed, setOperationFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const startedAt = useRef(Date.now());
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const zh = locale === 'zh-CN';

  function updateAnswer(group: 'vad' | 'panas', code: string, value: number): void {
    const next = { ...answers, [group]: { ...answers[group], [code]: value } };
    setAnswers(next);
    saveAssessmentDraft(accessCode, timepoint, page, next);
    setMessage('');
    setOperationFailed(false);
  }

  async function moveTo(nextPage: 1 | 2 | 3): Promise<void> {
    if (nextPage > page && !isPageComplete(page, answers)) {
      setMessage(zh ? '请完成当前页面后继续' : 'Please complete this page before continuing');
      return;
    }
    setSaving(true);
    try {
      await onDraft(nextPage, answers, Boolean(localDraft));
    } catch {
      setOperationFailed(true);
      setMessage(zh ? '答案已保存在本机，请联网后再次点击继续' : 'Saved on this device. Reconnect and tap again.');
    } finally {
      setSaving(false);
    }
    setPage(nextPage);
    saveAssessmentDraft(accessCode, timepoint, nextPage, answers);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(): Promise<void> {
    if (!isPageComplete(3, answers)) {
      setMessage(zh ? '请完成当前页面' : 'Please complete this page');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(3, answers, Date.now() - startedAt.current, Boolean(localDraft));
      clearAssessmentDraft(accessCode, timepoint);
    } catch {
      setOperationFailed(true);
      setMessage(
        zh ? '提交失败，答案仍保存在本机，请检查网络后重试' : 'Submission failed. Your answers remain on this device.'
      );
    } finally {
      setSaving(false);
    }
  }

  function handleTouchEnd(event: React.TouchEvent): void {
    const start = touchStart.current;
    if (!start) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    if (deltaX < 0 && page < 3) void moveTo((page + 1) as 1 | 2 | 3);
    if (deltaX > 0 && page > 1) void moveTo((page - 1) as 1 | 2 | 3);
  }

  const phaseTitle = timepoint === 'pre' ? (zh ? '活动前测' : 'BEFORE ACTIVITY') : zh ? '活动后测' : 'AFTER ACTIVITY';
  const panasStart = page === 2 ? FIRST_PANAS_INDEX : SECOND_PANAS_INDEX;
  return (
    <main
      className="assessment-screen"
      onTouchStart={(event) => {
        touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }}
      onTouchEnd={handleTouchEnd}
    >
      <CourseProgress
        locale={locale}
        currentStep={timepoint === 'pre' ? 1 : 4}
        pendingArtwork={pendingArtwork}
        failedStep={operationFailed ? (timepoint === 'pre' ? 1 : 4) : undefined}
      />
      <section className="classroom-card assessment-card">
        <header className="assessment-heading">
          <span>{phaseTitle}</span>
          <strong>{page} / 3</strong>
          <h1>{zh ? '此刻，你感觉如何？' : 'How do you feel right now?'}</h1>
          <p>
            {zh
              ? '答案没有好坏，只选择最接近此刻感受的选项。'
              : 'There are no right answers. Choose what best fits this moment.'}
          </p>
        </header>
        {page === 1 ? (
          <div>
            {VAD_ITEMS.map((item) => (
              <VadQuestion
                key={item.code}
                item={item}
                locale={locale}
                value={answers.vad[item.code]}
                onChange={(value) => updateAnswer('vad', item.code, value)}
              />
            ))}
          </div>
        ) : (
          <div className="panas-list">
            <div className="panas-anchors">
              <span>{zh ? '1 完全没有' : '1 Not at all'}</span>
              <span>{zh ? '5 非常强烈' : '5 Extremely'}</span>
            </div>
            {PANAS_ITEMS.slice(panasStart, panasStart + PANAS_PAGE_SIZE).map((item) => (
              <PanasQuestion
                key={item.code}
                item={item}
                locale={locale}
                value={answers.panas[item.code]}
                onChange={(value) => updateAnswer('panas', item.code, value)}
              />
            ))}
          </div>
        )}
        {message && (
          <p className="assessment-message" role="status">
            {message}
          </p>
        )}
        <div className="assessment-actions">
          <button
            className="classroom-secondary"
            type="button"
            disabled={page === 1 || saving}
            onClick={() => void moveTo((page - 1) as 1 | 2 | 3)}
          >
            {zh ? '上一页' : 'Previous'}
          </button>
          {page < 3 ? (
            <button
              className="classroom-primary"
              type="button"
              disabled={saving}
              onClick={() => void moveTo((page + 1) as 1 | 2 | 3)}
            >
              {zh ? '下一页' : 'Next'}
            </button>
          ) : (
            <button className="classroom-primary" type="button" disabled={saving} onClick={() => void submit()}>
              {zh ? `提交${phaseTitle}` : 'Submit'}
            </button>
          )}
        </div>
        <p className="swipe-hint">
          {zh ? '可以左右滑动，返回修改未提交的答案' : 'Swipe left or right to review before submission'}
        </p>
      </section>
    </main>
  );
}
