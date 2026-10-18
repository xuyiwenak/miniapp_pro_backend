import { useState } from 'react';
import { WatercolorBackdrop } from '@education/ui';
import { useParticipation } from './useParticipation';
import { Loading, Notice, STATUS_COPY } from '../components';
import type { Participation, Mode, Turn } from '../types';
import { ArtworkUpload } from './ArtworkUpload';
import { PATTERN_VERSION } from '@pattern/contract';
import { PatternClass } from './pattern/PatternClass';
import { AssistantPanel } from './AssistantPanel';

export function StudentApp({ code }: { code: string }) {
  const { token, course, data, error, busy, loading, consent, setConsent, load, join, complete, onTurn } =
    useParticipation(code);
  const [panel, setPanel] = useState<Mode | null>(null);
  if (data?.course.courseTemplateVersion === PATTERN_VERSION) {
    return <PatternClass data={data} token={token} completing={busy} participationError={error}
      onComplete={() => void complete()} onTurn={onTurn} />;
  }
  return <WatercolorBackdrop><main className="student-shell"><header className="student-header">
    <div className="brand"><span>原色有感</span><small>smartCourse · 智能课堂</small></div>
    <button onClick={() => void load()} disabled={loading}>刷新</button></header>
  <Notice>{error}</Notice>{loading && !course ? <Loading /> : course && <>
    <section className="course-welcome"><p className="eyebrow">{STATUS_COPY[(data?.course || course).status]}</p>
      <h1>{course.title}</h1><p className="brief">{course.brief}</p></section>
    {!data && course.status !== 'open' ? <section className="panel">
      <h2>{course.status === 'closed' ? '本课程已结束' : '课程尚未开放'}</h2>
      <p>{course.status === 'closed'
        ? '当前二维码不再接受加入，请向教师获取新课程的二维码或链接。'
        : '请等待教师开放课程，然后点击上方“刷新”。'}</p>
      {course.status === 'closed' && <p className="muted small">
        已参与过本课？请使用原设备和浏览器查看自己的记录。</p>}
    </section> : !data ? <section className="panel"><h2>准备好开始了吗？</h2><p>了解课程 → 线下创作 → 作品交流</p>
      <label className="consent">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
        <span>我已成年，同意将问题与选定作品发送给 AI 助教处理。作品可由本课教师查看，对话不向其他学生公开。</span></label>
      <p className="muted small">无需填写姓名或学号。请使用同一设备和浏览器返回课程。</p>
      <button className="primary" disabled={busy || !consent || course.status !== 'open'} onClick={() => void join()}>
        {busy ? '正在进入…' : '进入课程'}</button></section>
      : <StudentContent data={data} token={token} panel={panel} busy={busy} setPanel={setPanel}
        onTurn={onTurn} onRefresh={() => void load()} onComplete={() => void complete()} />}</>}
  <footer className="student-footer">保留自己的选择，建议只是创作的另一种可能。</footer></main></WatercolorBackdrop>;
}
function StudentContent({ data, token, panel, busy, setPanel, onTurn, onRefresh, onComplete }: {
  data: Participation; token: string; panel: Mode | null; busy: boolean;
  setPanel: (mode: Mode | null) => void; onTurn: (turn: Turn) => void; onRefresh: () => void; onComplete: () => void;
}) {
  const closed = data.course.status !== 'open';
  return <><section className="panel"><p className="eyebrow">创作进行时</p><h2>慢慢画，有问题就聊聊</h2>
    <p>在线下完成你的纹样。助教可以解释课程，也可以陪你寻找一个开始的方法。</p>
    <div className="actions">
      <button disabled={!data.agentReady} onClick={() => setPanel('question')}>问问课程助教</button>
      <button disabled={!data.agentReady} onClick={() => setPanel('create')}>创作卡住了</button></div>
    {!data.agentReady && <p className="muted">课程助教暂未配置，当前可以查看课程并参与活动。</p>}
    {closed && <p className="muted">本课已结束，可以查看记录，暂不能继续上传或提问。</p>}</section>
  {data.uploadReady ? <ArtworkUpload courseId={data.course.courseId} token={token}
    disabled={closed} onUploaded={onRefresh} />
    : <section className="panel"><h2>作品上传暂不可用</h2><p>上传服务尚未配置，请先保留作品照片。</p></section>}
  {data.artworks.length > 0 && <section className="panel"><p className="eyebrow">作品交流</p><h2>看看自己的选择</h2>
    <img className="student-artwork" src={data.artworks[0].imageUrl} alt="你最近上传的作品" />
    <p className="brief">{data.artworks[0].statement}</p><button className="primary" disabled={!data.agentReady} onClick={() => setPanel('review')}>
        聊聊这幅作品</button></section>}
  <section className="panel finish"><h2>{data.completed ? '本次活动已完成' : '按自己的节奏结束'}</h2>
    <p>{data.completed ? '你仍可以回来查看作品与交流记录。' : '不需要获得 AI 认可，也不需要完成固定次数的对话。'}</p>
    {!data.completed && <button disabled={busy || closed} onClick={onComplete}>完成本次活动</button>}</section>
  {panel && <AssistantPanel courseId={data.course.courseId} token={token} artworks={data.artworks} turns={data.turns}
    initialMode={panel} disabled={closed} onClose={() => setPanel(null)} onTurn={onTurn} />}</>;
}
