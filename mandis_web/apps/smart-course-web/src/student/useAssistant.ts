import { useRef, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api';
import type { Mode, Turn } from '../types';
import type { AssistantProps } from './AssistantPanel';
export function useAssistant(props: AssistantProps) {
  const [mode, setMode] = useState<Mode>(props.initialMode);
  const [artworkId, setArtworkId] = useState(props.initialMode === 'review' ? props.artworks[0]?.artworkId || '' : '');
  const [question, setQuestion] = useState(''); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ requestId: string; question: string; mode: Mode; artworkId?: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!question.trim() || busy) return;
    const input = { question: question.trim(), mode, ...(artworkId ? { artworkId } : {}) };
    if (!pending.current || pending.current.question !== input.question || pending.current.mode !== mode
      || pending.current.artworkId !== input.artworkId) {
      const previous = props.turns.find(turn => turn.status === 'pending' && turn.question === input.question
        && turn.mode === mode && turn.artworkId === input.artworkId);
      pending.current = { ...input, requestId: previous?.requestId || crypto.randomUUID() };
    }
    setBusy(true); setError('');
    try { const turn = await api<Turn>(`/courses/${props.courseId}/chat`, { method: 'POST',
      body: JSON.stringify(pending.current) }, props.token);
    props.onTurn(turn); pending.current = null; setQuestion(''); }
    catch (error) { setError(`${errorMessage(error)}。再次发送相同内容会查询原请求，避免重复调用。`); }
    finally { setBusy(false); }
  }
  function retry(turn: Turn) {
    setQuestion(turn.question); setMode(turn.mode); setArtworkId(turn.artworkId || ''); pending.current = null;
  }
  return { mode, setMode, artworkId, setArtworkId, question, setQuestion, error, busy, submit, retry };
}
