import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { PATTERN_VERSION } from '@pattern/contract';
import { PatternGallery } from './PatternGallery';
import { api, errorMessage, joinUrl } from '../api';
import { Notice, STATUS_COPY } from '../components';
import type { Course, Dashboard } from '../types';
export function CourseDashboard({ data, onChange }: { data: Dashboard; onChange: () => void }) {
  const [qr, setQr] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false); const [confirmClose, setConfirmClose] = useState(false);
  const { course, participants, artworks } = data;
  const url = course.status !== 'closed' && course.joinCode ? joinUrl(course.joinCode) : '';
  useEffect(() => { let active = true; setQr('');
    if (!url) return;
    void QRCode.toDataURL(url, { margin: 1, width: 160 }).then(image => { if (active) setQr(image); });
    return () => { active = false; }; }, [url]);
  async function changeStatus(status: Course['status']) {
    setBusy(true); setError('');
    try { await api(`/teacher/courses/${course.courseId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setConfirmClose(false); onChange(); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(url); setCopied(true); }
  catch { setError('复制未完成，可以直接复制下方课程链接'); } }
  return <><header className="page-heading"><div><p className="eyebrow">课程工作台</p><h1>{course.title}</h1>
    <span className={`status ${course.status}`}>{STATUS_COPY[course.status]}</span></div>
  <div className="actions">{course.status === 'draft' && <button className="primary" disabled={busy}
    onClick={() => void changeStatus('open')}>开放课程</button>}
  {course.status === 'open' && <button onClick={() => setConfirmClose(true)}>结束课程</button>}</div></header>
  <Notice>{error}</Notice>{confirmClose && <section className="notice"><p>结束后将停止加入、上传和助教提问，已有记录仍可查看。</p>
    <div className="actions"><button onClick={() => setConfirmClose(false)}>继续上课</button>
      <button disabled={busy} onClick={() => void changeStatus('closed')}>确认结束</button></div></section>}
  <div className="overview"><section className="panel"><h2>课堂概况</h2><p className="brief">{course.brief}</p>
    <div className="metrics"><div><strong>{participants.length}</strong><span>已加入</span></div>
      <div><strong>{course.courseTemplateVersion === PATTERN_VERSION ? (data.designs?.length || 0) : artworks.length}</strong><span>作品记录</span></div>
      <div><strong>{participants.filter(p => p.completed).length}</strong><span>已完成</span></div></div>
    <p className="muted small">课程助教：青花纹样创作 · {course.agentVersion}</p></section>
  <section className="panel invite"><h2>学生入口</h2>{course.status === 'closed' ?
    <p>本课程已结束，停止接受新学生加入。已有参与者可通过原链接查看记录。
      如需再次上课，请新建课程并使用新的二维码。</p> : <>{qr && <img src={qr} alt="加入本课程的二维码" width={160} height={160} />}
    <p className="muted">{course.status === 'draft' ? '开放课程后，学生可以扫码加入。' : '学生使用手机扫码，或打开课程链接。'}</p>
    <input readOnly aria-label="课程链接" value={url} />
    <button onClick={() => void copy()}>{copied ? '已复制' : '复制课程链接'}</button></>}
  </section></div>
  {course.courseTemplateVersion === PATTERN_VERSION ? <PatternGallery designs={data.designs || []} />
    : <ArtworkGallery artworks={artworks} />}</>;
}
function ArtworkGallery({ artworks }: Pick<Dashboard, 'artworks'>) {
  return <section className="panel"><h2>学生作品 <small>{artworks.length}</small></h2>
    {artworks.length ? <div className="gallery">{artworks.map((art, index) => <figure key={art.artworkId}>
      <a href={art.imageUrl} target="_blank" rel="noreferrer"><img src={art.imageUrl} alt={`学生作品 ${index + 1}`} /></a>
      <figcaption>{art.statement || '尚未填写创作说明'}</figcaption></figure>)}</div>
      : <div className="empty"><h3>等待第一幅作品</h3><p>学生上传后，作品会出现在这里。助教对话保持学生私密。</p></div>}
    <p className="muted small">当前显示最近 100 条参与及作品记录，可点击“刷新”更新。</p></section>;
}
