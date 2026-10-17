import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api';
import { Notice } from '../components';
import type { Artwork } from '../types';
export function ArtworkUpload({ courseId, token, onUploaded, disabled }: {
  courseId: string; token: string; onUploaded: (art: Artwork) => void; disabled: boolean;
}) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const file = data.get('image');
    if (!(file instanceof File) || !file.size) { setError('请选择作品图片'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('图片不能超过 10 MB'); return; }
    setBusy(true); setError('');
    try {
      onUploaded(await api<Artwork>(`/courses/${courseId}/artworks`, { method: 'POST', body: data }, token));
      form.reset();
    }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <section className="panel"><p className="eyebrow">记录创作</p><h2>上传你的作品</h2>
    <p className="muted">作品用于课程展示与助教观察，请避免拍入姓名和其他个人信息。</p>
    <form onSubmit={submit}><label>作品照片<input type="file" name="image"
      accept="image/jpeg,image/png,image/webp" required disabled={busy || disabled} /></label>
    <label>我想说的一句话 <span className="muted">（可选）</span><textarea name="statement" rows={3}
      maxLength={1000} placeholder="我选择这样排列，是因为……" disabled={busy || disabled} /></label>
    <Notice>{error}</Notice><button className="primary" disabled={busy || disabled}>
      {busy ? '正在上传作品…' : '保存作品'}</button></form></section>;
}
