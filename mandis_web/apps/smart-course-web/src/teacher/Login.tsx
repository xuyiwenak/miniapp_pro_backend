import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api';
import { Brand, Notice } from '../components';
export function Login({ onReady }: { onReady: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try { await api('/teacher/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(data)) }); onReady(); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <main className="access"><section className="access-card"><Brand />
    <p className="eyebrow">教师工作台</p><h1>让每一次创作，<br />都有可以交流的助教。</h1>
    <p className="muted">管理课程、邀请学生，在创作中提供及时的帮助。</p>
    <form onSubmit={submit}><label>教师账号<input name="username" autoComplete="username" required /></label>
      <label>密码<input name="password" type="password" autoComplete="current-password" required /></label>
      <Notice>{error}</Notice><button className="primary" disabled={busy}>{busy ? '正在登录…' : '进入工作台'}</button>
    </form><p className="muted small">教师账号由项目负责人开通。</p></section></main>;
}
