import { useEffect, useState } from 'react';
import {
  bindEmail,
  bindPhone,
  getAuthProfile,
  requestBoundEmail,
  requestBoundPhone,
  type AuthProfile,
} from '../api/mandis';
import type { Locale } from '../i18n/copy';

type CredentialFormProps = {
  kind: 'email' | 'phone';
  locale: Locale;
  token: string;
  onComplete: () => void;
};

function mask(value: string, visible: number): string {
  if (value.length <= visible * 2) return value;
  return `${value.slice(0, visible)}•••${value.slice(-visible)}`;
}

function CredentialForm({ kind, locale, token, onComplete }: CredentialFormProps) {
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const isEmail = kind === 'email';
  const label = isEmail ? (locale === 'zh-CN' ? '邮箱' : 'Email') : (locale === 'zh-CN' ? '手机号' : 'Phone');

  async function sendCode(): Promise<void> {
    try {
      if (isEmail) await requestBoundEmail(value, locale, token);
      else await requestBoundPhone(value, token);
      setMessage(locale === 'zh-CN' ? '验证码已发送。' : 'Verification code sent.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed.');
    }
  }

  async function bind(): Promise<void> {
    try {
      if (isEmail) await bindEmail(value, code, token);
      else await bindPhone(value, code, token);
      setMessage(locale === 'zh-CN' ? '绑定成功。' : 'Linked successfully.');
      onComplete();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Binding failed.');
    }
  }

  return (
    <div className="credential-form">
      <label>
        {label}
        <input value={value} inputMode={isEmail ? 'email' : 'tel'} onChange={(event) => setValue(event.target.value)} />
      </label>
      <button type="button" onClick={sendCode}>{locale === 'zh-CN' ? '获取验证码' : 'Send code'}</button>
      <label>
        {locale === 'zh-CN' ? '验证码' : 'Code'}
        <input value={code} inputMode="numeric" onChange={(event) => setCode(event.target.value)} />
      </label>
      <button className="secondary-button" type="button" onClick={bind}>{locale === 'zh-CN' ? '确认绑定' : 'Confirm link'}</button>
      {message && <p className="form-message" role="status">{message}</p>}
    </div>
  );
}

type ProfilePageProps = { locale: Locale; token: string };

export function ProfilePage({ locale, token }: ProfilePageProps) {
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [activeForm, setActiveForm] = useState<'email' | 'phone' | null>(null);
  const [message, setMessage] = useState('');

  async function refreshProfile(): Promise<void> {
    try { setProfile(await getAuthProfile(token)); } catch { setMessage(locale === 'zh-CN' ? '暂时无法读取账号信息。' : 'Account details are unavailable.'); }
  }

  useEffect(() => { void refreshProfile(); }, [token]);

  const title = locale === 'zh-CN' ? '账号与安全' : 'Account & security';
  const cards = [
    { key: 'phone', title: locale === 'zh-CN' ? '手机号' : 'Phone', value: profile?.phone ? mask(profile.phone, 3) : null },
    { key: 'email', title: locale === 'zh-CN' ? '邮箱' : 'Email', value: profile?.email ? mask(profile.email, 2) : null },
  ] as const;

  return (
    <main className="workspace profile-page">
      <section className="workspace__heading">
        <p className="workspace__eyebrow">{locale === 'zh-CN' ? '你的登录方式' : 'YOUR SIGN-IN METHODS'}</p>
        <h1>{title}</h1>
        <p>{locale === 'zh-CN' ? '你可以主动绑定新的登录方式。系统不会自动合并账号。' : 'Link sign-in methods by choice. Accounts are never merged automatically.'}</p>
      </section>
      {message && <p className="form-error" role="alert">{message}</p>}
      <section className="credential-list" aria-label={title}>
        {cards.map((card) => (
          <article className="credential-row" key={card.key}>
            <div><strong>{card.title}</strong><span>{card.value ?? (locale === 'zh-CN' ? '尚未绑定' : 'Not linked')}</span></div>
            {card.value ? <span className="credential-status">{locale === 'zh-CN' ? '已保护' : 'Protected'}</span> : (
              <button type="button" onClick={() => setActiveForm(card.key)}>
                {locale === 'zh-CN' ? '绑定' : 'Link'}
              </button>
            )}
          </article>
        ))}
      </section>
      {activeForm && <CredentialForm kind={activeForm} locale={locale} token={token} onComplete={() => { setActiveForm(null); void refreshProfile(); }} />}
    </main>
  );
}
