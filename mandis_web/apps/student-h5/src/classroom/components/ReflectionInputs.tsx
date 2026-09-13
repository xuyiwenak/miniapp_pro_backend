import { useEffect, useState } from 'react';

const VAD_SCORES = Array.from({ length: 9 }, (_, index) => index + 1);
const LIKERT_SCORES = VAD_SCORES.slice(0, 7);
export function useDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T ?? initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Keep in-memory answers. */ } },
    [key, value]);
  return [value, setValue] as const;
}
export function ScoreChoice({ label, value, onChange, vad = false, anchors }: {
  label: string; value?: number; onChange: (score: number) => void; vad?: boolean; anchors: string;
}) {
  return <fieldset className="reflection-question">
    <legend>{label}</legend>
    <p className="reflection-anchors">{anchors}</p>
    <div className={`reflection-scores${vad ? ' is-vad' : ''}`}>{(vad ? VAD_SCORES : LIKERT_SCORES).map((score) =>
      <label key={score} className={value === score ? 'is-selected' : ''}>
        <input type="radio" checked={value === score} onChange={() => onChange(score)} />{score}
      </label>)}</div>
  </fieldset>;
}
export function useSaveDraft<T>(zh: boolean, input: T, onSave: (input: T, submit: boolean) => Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  async function save(submit: boolean) {
    setSaving(true); setMessage('');
    try { await onSave(input, submit); setMessage(zh ? '已保存' : 'Saved'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save'); }
    finally { setSaving(false); }
  }
  return { saving, message, save };
}
