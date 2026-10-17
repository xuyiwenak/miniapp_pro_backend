import { useEffect, useRef } from 'react';
import { useAssistant } from './useAssistant';
import { Notice } from '../components';
import type { Artwork, Mode, Turn } from '../types';

export type AssistantProps = { courseId: string; token: string; artworks: Artwork[]; turns: Turn[]; initialMode: Mode;
  disabled: boolean; onClose: () => void; onTurn: (turn: Turn) => void };
export function AssistantPanel(props: AssistantProps) {
  const dialog = useRef<HTMLDialogElement>(null); const bottom = useRef<HTMLDivElement>(null);
  const { mode, setMode, artworkId, setArtworkId, question, setQuestion, error, busy, submit, retry } =
    useAssistant(props);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [props.turns.length, busy]);
  const artwork = props.artworks.find(art => art.artworkId === artworkId);
  return <dialog ref={dialog} className="assistant-dialog"
    onCancel={event => { event.preventDefault(); if (!busy) props.onClose(); }}>
    <header><div><p className="eyebrow">课程中的一点帮助</p><h2>青花纹样创作助教</h2></div>
      <button disabled={busy} onClick={props.onClose} aria-label="关闭助教">关闭</button></header>
    <div className="chat-body" aria-live="polite">{!props.turns.length && <div className="chat-intro"><h3>从你的问题开始</h3>
      <p>可以问课程内容，也可以聊聊创作中卡住的地方。助教不会替你打分或判断教师是否认可。</p></div>}
    {props.turns.map(turn => <div className="turn" key={turn.requestId}>
      <p className="student-message"><span>我</span>{turn.question}</p>
      <p className="assistant-message"><span>课程助教</span>{turnText(turn)}</p>
      {turn.status === 'failed' && <button disabled={busy || props.disabled} onClick={() => retry(turn)}>
        重新填写这条问题</button>}</div>)}
    {busy && <p className="thinking" role="status">助教正在阅读，通常需要一些时间…</p>}<div ref={bottom} /></div>
    <form onSubmit={submit} className="composer"><div className="composer-options">
      <label>我需要<select value={mode} disabled={busy} onChange={e => setMode(e.target.value as Mode)}>
        <option value="question">课程答疑</option><option value="create">创作帮助</option><option value="review">作品交流</option>
      </select></label><label>本次作品<select value={artworkId} disabled={busy}
        onChange={e => setArtworkId(e.target.value)}>
        <option value="">不附作品</option>{props.artworks.map((art, index) =>
          <option key={art.artworkId} value={art.artworkId}>作品 {props.artworks.length - index}</option>)}
      </select></label></div>{artwork && <div className="attachment"><img src={artwork.imageUrl} alt="本次交流的作品" />
      <span>{artwork.statement || '将结合这幅作品交流'}</span></div>}
    <label className="sr-only" htmlFor="question">你的问题</label><textarea id="question" rows={3} maxLength={2000}
      value={question} disabled={busy || props.disabled} onChange={e => setQuestion(e.target.value)}
      placeholder="写下你的问题…" />
    <Notice>{error}</Notice><div className="actions"><small className="muted">AI 建议仅供参考</small>
      <button className="primary" disabled={busy || props.disabled || !question.trim()}>
        {busy ? '正在回答…' : '发送'}</button></div>
    </form></dialog>;
}

function turnText(turn: Turn) {
  if (turn.status === 'success') return turn.answer;
  if (turn.status === 'pending') return '这条请求尚未完成。请刷新记录，或发送相同问题查询。';
  return '这次未能取得回答，可以重新发送问题。';
}
