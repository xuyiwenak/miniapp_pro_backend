import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api';
import { Notice } from '../components';
import type { Course } from '../types';
export function CreateCourse({ onCreated, onCancel }: { onCreated: (course: Course) => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { const data = Object.fromEntries(new FormData(event.currentTarget));
      if (!data.courseTemplateVersion) delete data.courseTemplateVersion;
      onCreated(await api<Course>('/teacher/courses', { method: 'POST', body: JSON.stringify(data) })); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <section className="panel create"><p className="eyebrow">准备一堂课</p><h1>新建青花纹样课程</h1>
    <p className="muted">当前助教围绕青花纸上纹样创作提供帮助，课程说明将展示给学生。</p>
    <form onSubmit={submit}><label>课堂流程<select name="courseTemplateVersion" defaultValue="qinghua-plate-v1">
      <option value="qinghua-plate-v1">青花盘创作 · 上传 → 连续排列 → 盘面 → 成品</option>
      <option value="">自由纹样创作（原有流程）</option></select></label><label>课程名称<input name="title" maxLength={80} required
      defaultValue="我的青花盘 · 纹样创作课堂" placeholder="例如：青花纹样 · 第一课" /></label>
    <label>课程说明<textarea name="brief" maxLength={2000} rows={5} required
      defaultValue="准备白纸与画笔，画一个自己的单独纹样。上传后选择青花配色与重复方式，放入圆盘，加上署名方章，保存你的青花盘。原稿会保留，助教建议由你决定是否采纳。" /></label>
    <Notice>{error}</Notice><div className="actions"><button type="button" onClick={onCancel}>取消</button>
      <button className="primary" disabled={busy}>{busy ? '正在创建…' : '创建课程'}</button></div></form></section>;
}
