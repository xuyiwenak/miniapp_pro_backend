import { useEffect, useState } from 'react';
import { LeftOutlined, CheckCircleOutlined, LockOutlined } from '@ant-design/icons';
import type { Locale, GalleryState, GalleryDetail, EvaluationInput, PeerAnswers }
  from '@mandis/common/classroom-types';
import { galleryApi } from '../galleryApi';
import { GallerySharing } from './GallerySharing';
import { PeerIndependentForm } from './PeerIndependentForm';
import { AiContent } from './SessionReview';

export function GalleryImage({ token, id, zh }: { token: string; id: string; zh: boolean }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let localUrl = '';
    setFailed(false); setUrl('');
    galleryApi.image(token, id, controller.signal).then((value) => {
      localUrl = value;
      if (controller.signal.aborted) URL.revokeObjectURL(value); else setUrl(value);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (localUrl) URL.revokeObjectURL(localUrl); };
  }, [token, id, retry]);
  if (failed) return <span role="status">{zh ? '图片加载失败' : 'Image unavailable'}
    <button onClick={(event) => { event.stopPropagation(); setRetry(retry + 1); }}>{zh ? '重试' : 'Retry'}</button></span>;
  return url ? <img src={url} alt={zh ? '匿名课堂作品' : 'Anonymous classroom artwork'} />
    : <span>{zh ? '正在读取图片…' : 'Loading image…'}</span>;
}
const LABELS = {
  not_started: ['未评价', 'Not reviewed'], draft: ['待继续', 'Continue'],
  independent_submitted: ['待评价 AI', 'Review AI'], completed: ['已评价', 'Reviewed'],
};
export function ClassroomGallery({ token, locale }: { token: string; locale: Locale }) {
  const zh = locale === 'zh-CN';
  const [state, setState] = useState<GalleryState>();
  const [selected, setSelected] = useState<GalleryDetail>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load(cursor?: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await galleryApi.list(token, cursor);
      setState((previous) => ({ ...result, items: cursor ? [...(previous?.items ?? []), ...result.items] : result.items }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [token]);
  async function open(id: string) {
    setBusy(true); setError(''); setMessage('');
    try { setSelected(await galleryApi.detail(token, id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  async function save(stage: 'independent' | 'feedback', answers: PeerAnswers | Partial<EvaluationInput>,
    submit: boolean, consent: boolean) {
    if (!selected) return;
    setBusy(true); setError(''); setMessage('');
    try {
      setSelected(await galleryApi.save(token, selected.galleryId, stage, answers, submit, consent));
      setMessage(zh ? (submit ? '已提交' : '已保存，可稍后回来继续') : (submit ? 'Submitted' : 'Saved for later'));
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setBusy(false); }
  }
  return <main className="classroom-card gallery-screen">
    {selected && <button className="reflection-text-button" onClick={() => { setSelected(undefined); void load(); }}>
      <LeftOutlined /> {zh ? '返回课堂作品' : 'Back to gallery'}</button>}
    <h1>{selected ? (selected.independentSubmittedAt ? (zh ? 'AI 解读' : 'AI reflection')
      : (zh ? '作品感受' : 'Artwork impression')) : (zh ? '课堂作品' : 'Classroom artworks')}</h1>
    {state?.readOnly && <p className="peer-lock-note">{zh ? '课堂已封存，仅可查看' : 'Classroom archived · view only'}</p>}
    {state?.deadline && <p className="peer-lock-note">{zh ? '评价截止：' : 'Review deadline: '}
      {new Date(state.deadline).toLocaleString(zh ? 'zh-CN' : 'en')}</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="form-error">{error}
      <button className="reflection-text-button" onClick={() => selected ? void open(selected.galleryId) : void load()}>
        {zh ? '重新读取' : 'Reload'}</button></p>}
    {!selected ? <>
      <p className="gallery-subtitle">{zh ? '仅本课堂可见 · 匿名展示' : 'Classmates only · Anonymous'}</p>
      <div className="gallery-grid">{state?.items.map((item) => <article key={item.galleryId} className={item.mine ? 'is-mine' : ''}>
        <div className="gallery-thumbnail" role="button" tabIndex={busy ? -1 : 0}
          aria-label={zh ? '查看作品' : 'View artwork'} onClick={() => { if (!busy) void open(item.galleryId); }}
          onKeyDown={(event) => { if (!busy && ['Enter', ' '].includes(event.key)) {
            event.preventDefault(); void open(item.galleryId);
          } }}><GalleryImage token={token} id={item.galleryId} zh={zh} /></div>
        <button disabled={busy} onClick={() => void open(item.galleryId)}>
          {item.mine ? (zh ? '我的作品' : 'My artwork') : LABELS[item.progress][zh ? 0 : 1]}
          {item.progress === 'completed' && <CheckCircleOutlined />}</button>
      </article>)}</div>
      {state && !state.items.length && <p>{state.emptyReason === 'no_shared_works'
        ? (zh ? '暂时还没有同学选择展示作品。' : 'No classmates have shared artwork yet.')
        : zh ? '作品正在等待上传或匿名检查，通过后会出现在这里。'
        : 'No artwork is available yet. Shared works appear after the anonymity check.'}</p>}
      {state?.items.length === 1 && state.items[0].mine && <p>{zh ? '目前只有你的作品，其他同学的作品通过检查后可以参与评价。'
        : 'Only your artwork is available. Check back for classmates’ work.'}</p>}
      {state?.nextCursor && <button className="classroom-secondary" disabled={busy}
        onClick={() => void load(state.nextCursor)}>{zh ? '更多作品' : 'More artworks'}</button>}
      {busy && <p role="status">{zh ? '正在读取…' : 'Loading…'}</p>}
      <GallerySharing token={token} locale={locale} readOnly={state?.readOnly} />
    </> : <>
      <div className="peer-progress"><span>{selected.independentSubmittedAt ? <CheckCircleOutlined /> : '1'}
        {zh ? '我的感受' : 'My impression'}</span>
        <span>{selected.independentSubmittedAt ? <CheckCircleOutlined /> : <LockOutlined />}
          {zh ? 'AI 解读' : 'AI reflection'}</span></div>
      <details className="gallery-image-detail"><summary>{zh ? '查看 / 放大作品' : 'View / enlarge artwork'}</summary>
        <GalleryImage token={token} id={selected.galleryId} zh={zh} /></details>
      <div className={`peer-artwork${selected.independentSubmittedAt ? ' peer-artwork--compact' : ''}`}>
        <GalleryImage token={token} id={selected.galleryId} zh={zh} />
        {selected.independentSubmittedAt && <strong>{zh ? '作品回响' : 'Artwork reflection'}</strong>}</div>
      {selected.independentSubmittedAt && selected.echo?.status !== 'success' &&
        <button className="classroom-secondary" disabled={busy} onClick={() => void open(selected.galleryId)}>
          {zh ? '刷新 AI 解读状态' : 'Refresh AI status'}</button>}
      {selected.mine ? <p>{zh ? '这是你的作品，不能作为匿名互评对象。' : 'You cannot anonymously review your own work.'}</p>
        : selected.independentSubmittedAt ? <PeerAiForm key={selected.galleryId} detail={selected} zh={zh}
          readOnly={Boolean(state?.readOnly)} busy={busy} onSave={(input, submit) => save('feedback', input, submit, true)} />
          : state?.readOnly ? <p>{zh ? '封存前未提交独立感受，AI 解读尚未解锁。' : 'AI remains locked without an independent response.'}</p>
            : <PeerIndependentForm key={selected.galleryId} zh={zh} saved={selected.independent} busy={busy}
              consentGranted={selected.peerConsented}
              onSave={(input, submit, consent) => save('independent', input, submit, consent)} />}
    </>}
  </main>;
}
function PeerAiForm({ detail, zh, readOnly, busy, onSave }: {
  detail: GalleryDetail; zh: boolean; readOnly: boolean; busy: boolean;
  onSave: (input: Partial<EvaluationInput>, submit: boolean) => Promise<void>;
}) {
  const [responses, setResponses] = useState<EvaluationInput['moduleResponses']>(detail.moduleResponses ?? {});
  const [message, setMessage] = useState('');
  const modules = detail.echo?.modules ?? [];
  const [editing, setEditing] = useState(false);
  useEffect(() => { setEditing(false); }, [detail]);
  const completed = modules.filter((code) => responses[code]?.responseCode).length;
  const locked = readOnly || (Boolean(detail.feedbackSubmittedAt) && !editing);
  function save(submit: boolean) {
    const missing = modules.find((code) => !responses[code]?.responseCode);
    if (submit && missing) {
      setMessage(zh ? '请完成每个模块的评价' : 'Please review each section');
      document.getElementById(`module-evaluation-${missing}`)?.scrollIntoView({ block: 'center' });
      return;
    }
    void onSave({ analysisRunId: detail.echo?.analysisRunId, reportVersion: detail.echo?.reportVersion,
      moduleResponses: responses }, submit);
  }
  return <section id="ai-reflection-content">
    <p className="evaluation-progress"><CheckCircleOutlined /> {zh ? '独立评价已保存' : 'Independent response saved'}
      <span>{zh ? `已评价 ${completed} / ${modules.length}` : `${completed} / ${modules.length}`}</span></p>
    <fieldset disabled={locked || busy} className="peer-ai-fields">
      <AiContent echo={detail.echo ?? null} zh={zh} waitExpired={false} failed={false} hasArtwork
        evaluation={{ modules, responses, onChange: (code, responseCode) => setResponses({ ...responses,
          [code]: { responseCode, missingReason: null } }) }} />
    </fieldset>
    <p role="status">{message || (detail.feedbackSubmittedAt ? (zh ? '评价已提交' : 'Review submitted') : '')}</p>
    {!readOnly && detail.feedbackSubmittedAt && !editing &&
      <button className="reflection-text-button" onClick={() => setEditing(true)}>
        {zh ? '修订评价（保留首次记录）' : 'Revise feedback (original retained)'}</button>}
    {!locked && detail.echo?.status === 'success' && <><button className="classroom-primary" disabled={busy} onClick={() => save(true)}>
      {zh ? '提交评价' : 'Submit review'}</button>
      {!detail.feedbackSubmittedAt && <button className="reflection-text-button" disabled={busy} onClick={() => save(false)}>
        {zh ? '保存，稍后继续' : 'Save for later'}</button>}</>}
  </section>;
}
