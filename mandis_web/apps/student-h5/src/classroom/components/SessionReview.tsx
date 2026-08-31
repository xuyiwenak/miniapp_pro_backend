import { useState } from 'react';
import type {
  ClassroomInfo,
  EchoResult,
  Locale,
  ParticipationState,
} from '@mandis/common/classroom-types';
import {
  buildAffectMeasures,
  buildVadMeasures,
  type SessionMeasure,
} from '../sessionResults';

const REVIEW_PAGE_COUNT = 4;

type Props = {
  locale: Locale;
  classroom: ClassroomInfo;
  participation: ParticipationState;
  echo: EchoResult | null;
  initialPage?: number;
  waitExpired: boolean;
  statusQueryFailed: boolean;
};

function ReviewHeading({ classroom, title }: { classroom: ClassroomInfo; title: string }) {
  return (
    <header className="review-heading">
      <span>{classroom.sessionTitle}</span>
      <h1>{title}</h1>
    </header>
  );
}

function changeText(measure: SessionMeasure, zh: boolean): string {
  if (measure.pre === null || measure.post === null) return zh ? '暂无完整记录' : 'No complete record';
  const delta = measure.post - measure.pre;
  if (delta === 0) return zh ? '保持不变' : 'No change';
  if (delta > 0) return zh ? `上升 ${delta}` : `Up ${delta}`;
  return zh ? `下降 ${Math.abs(delta)}` : `Down ${Math.abs(delta)}`;
}

function MeasureCard({ measure, zh }: { measure: SessionMeasure; zh: boolean }) {
  const prePercent = measure.pre === null ? 0 : ((measure.pre - measure.min) / (measure.max - measure.min)) * 100;
  const postPercent = measure.post === null ? 0 : ((measure.post - measure.min) / (measure.max - measure.min)) * 100;
  return (
    <article className="review-measure">
      <div className="review-measure__title">
        <h2>{zh ? measure.zhLabel : measure.enLabel}</h2>
        <span>{measure.min}–{measure.max}</span>
      </div>
      <div className="review-score-row">
        <span>{zh ? '活动前' : 'Before'}</span>
        <div><i style={{ width: `${prePercent}%` }} /></div>
        <strong>{measure.pre ?? '—'}</strong>
      </div>
      <div className="review-score-row is-post">
        <span>{zh ? '活动后' : 'After'}</span>
        <div><i style={{ width: `${postPercent}%` }} /></div>
        <strong>{measure.post ?? '—'}</strong>
      </div>
      <p className="review-change">{changeText(measure, zh)}</p>
    </article>
  );
}

function CoverPage({ locale, classroom }: { locale: Locale; classroom: ClassroomInfo }) {
  const zh = locale === 'zh-CN';
  return (
    <div className="review-page review-cover">
      <ReviewHeading classroom={classroom} title={zh ? '本次课堂状态回顾' : 'Your session review'} />
      <p className="review-cover__theme">{classroom.activityTheme}</p>
      <dl className="review-session-meta">
        <div><dt>{zh ? '课程' : 'Course'}</dt><dd>{classroom.courseName}</dd></div>
        <div><dt>{zh ? '日期' : 'Date'}</dt><dd>{classroom.classDate}</dd></div>
        <div><dt>{zh ? '课堂' : 'Session'}</dt><dd>{classroom.sessionTitle}</dd></div>
      </dl>
      <aside className="review-notice">
        {zh
          ? '这是你在本次课堂中的自评记录，只描述活动前后的状态，'
            + '不代表诊断、评分或疗效。'
          : 'This is your self-reported state for this session. It is not a diagnosis, grade or treatment claim.'}
      </aside>
    </div>
  );
}

function MeasuresPage({
  locale,
  classroom,
  measures,
  kind,
}: {
  locale: Locale;
  classroom: ClassroomInfo;
  measures: SessionMeasure[];
  kind: 'vad' | 'affect';
}) {
  const zh = locale === 'zh-CN';
  const title = kind === 'vad' ? (zh ? '此刻感受的前后变化' : 'Before and after: felt state')
    : (zh ? '情绪体验的前后变化' : 'Before and after: affect');
  return (
    <div className="review-page">
      <ReviewHeading classroom={classroom} title={title} />
      <div className="review-measures">{measures.map((measure) => (
        <MeasureCard key={measure.code} measure={measure} zh={zh} />
      ))}</div>
      <p className="review-scale-note">
        {kind === 'vad'
          ? zh
            ? '量尺范围为 1–9；唤醒度的高低没有好坏。'
            : 'Scale: 1–9. Arousal is not good or bad.'
          : zh ? 'PA 与 NA 各由 5 个题目相加，范围均为 5–25，两者不合并。'
            : 'PA and NA each sum five items (5–25) and are not combined.'}
      </p>
    </div>
  );
}

function AiContent({ echo, zh, waitExpired, failed, hasArtwork }: {
  echo: EchoResult | null;
  zh: boolean;
  waitExpired: boolean;
  failed: boolean;
  hasArtwork: boolean;
}) {
  if (echo?.status === 'success') return (
    <>
      <h2>{zh ? '作品中的颜色与线条' : 'Colour and line in your artwork'}</h2>
      {echo.colorAnalysis && <p>{echo.colorAnalysis}</p>}
      {echo.summary && <p>{echo.summary}</p>}
      {echo.compositionReport && <p>{echo.compositionReport}</p>}
      {echo.suggestion && <aside>{echo.suggestion}</aside>}
    </>
  );
  if (!hasArtwork) return (
    <>
      <h2>{zh ? '等待补充作品' : 'Waiting for the artwork'}</h2>
      <p>
        {zh
          ? '作品补充后，系统会再整理这部分回响。'
          : 'This reflection will be prepared after the artwork is added.'}
      </p>
    </>
  );
  if (echo?.status === 'failed' || failed) return (
    <>
      <h2>{zh ? '作品回响暂时未能生成' : 'Reflection is not available yet'}</h2>
      <p>
        {zh
          ? '作品和测评已经保存，你可以稍后重新扫码查看。'
          : 'Your artwork and assessments are saved. Scan again later.'}
      </p>
    </>
  );
  return (
    <>
      <h2>{zh ? '正在整理作品回响' : 'Preparing your artwork reflection'}</h2>
      <p>
        {waitExpired
          ? zh
            ? '处理时间比平时更长。数据已经保存，可稍后重新扫码查看。'
            : 'This is taking longer than usual. Your data is saved; scan again later.'
          : zh
            ? '请稍等，系统正在整理颜色、线条和构图观察。'
            : 'Please wait while colour, line and composition observations are prepared.'}
      </p>
      {!waitExpired && (
        <span className="review-waiting" aria-label={zh ? '正在处理' : 'Processing'}>•••</span>
      )}
    </>
  );
}

function AiPage({ locale, classroom, participation, echo, waitExpired, statusQueryFailed }: Props) {
  const zh = locale === 'zh-CN';
  return (
    <div className="review-page review-ai" aria-live="polite">
      <ReviewHeading classroom={classroom} title={zh ? '作品回响' : 'Artwork reflection'} />
      {echo?.coverUrl && <img src={echo.coverUrl} alt={zh ? '本次课堂作品' : 'Artwork from this session'} />}
      <AiContent
        echo={echo}
        zh={zh}
        waitExpired={waitExpired}
        failed={statusQueryFailed}
        hasArtwork={Boolean(participation.artworkId || echo?.coverUrl)}
      />
      <aside className="review-boundary">
        {zh
          ? '学生自评是主要记录；AI 仅辅助整理作品的可见特征，'
            + '不用于心理诊断或课程评分。'
          : 'Self-report is primary. AI only organises visible artwork features '
            + 'and is not used for diagnosis or grading.'}
      </aside>
    </div>
  );
}

export function SessionReview(props: Props) {
  const { locale, classroom, participation, echo, waitExpired, statusQueryFailed } = props;
  const [page, setPage] = useState(props.initialPage ?? 1);
  const zh = locale === 'zh-CN';
  const pages = [
    <CoverPage key="cover" locale={locale} classroom={classroom} />,
    <MeasuresPage
      key="vad"
      locale={locale}
      classroom={classroom}
      measures={buildVadMeasures(participation)}
      kind="vad"
    />,
    <MeasuresPage
      key="affect"
      locale={locale}
      classroom={classroom}
      measures={buildAffectMeasures(participation)}
      kind="affect"
    />,
    <AiPage key="ai" {...props} />,
  ];
  return (
    <section className="session-review">
      {pages[page - 1]}
      <footer className="review-footer">
        <p>
          {zh
            ? `第 ${page} / ${REVIEW_PAGE_COUNT} 页 · 可截图保存本页`
            : `Page ${page} of ${REVIEW_PAGE_COUNT} · Screenshot to save`}
        </p>
        <div className="review-pagination" aria-label={zh ? '课堂回顾分页' : 'Session review pages'}>
          <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
            {zh ? '上一页' : 'Previous'}
          </button>
          <span>{Array.from({ length: REVIEW_PAGE_COUNT }, (_, index) => (
            <i key={index} className={index + 1 === page ? 'is-current' : ''} />
          ))}</span>
          <button
            type="button"
            disabled={page === REVIEW_PAGE_COUNT}
            onClick={() => setPage((value) => value + 1)}
          >
            {zh ? '下一页' : 'Next'}
          </button>
        </div>
      </footer>
    </section>
  );
}
