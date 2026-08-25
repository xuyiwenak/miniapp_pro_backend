import { useState } from 'react';
import type { Locale } from '../i18n/copy';
import { COPY } from '../i18n/copy';
import { BrandMark } from '../components/BrandMark';
import { LocaleToggle } from '../components/LocaleToggle';
import { WatercolorBackdrop } from '../components/WatercolorBackdrop';
import { requestEmail, requestSms, startWechatLogin, verifyEmail, verifySms } from '../api/mandis';

type LoginPageProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onLogin: (token: string) => void;
};

export function LoginPage({ locale, onLocaleChange, onLogin }: LoginPageProps) {
  const [method, setMethod] = useState<'email' | 'phone' | 'scan'>('scan');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  async function sendCode(): Promise<void> {
    try {
      if (method === 'phone') await requestSms(identifier);
      if (method === 'email') await requestEmail(identifier, locale);
      setMessage(locale === 'zh-CN' ? '验证码已发送，请查收。' : 'Your verification code has been sent.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to send the code.');
    }
  }

  async function completeCodeLogin(): Promise<void> {
    try {
      const result = method === 'phone'
        ? await verifySms(identifier, code)
        : await verifyEmail(identifier, code);
      onLogin(result.token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign in.');
    }
  }
  return (
    <WatercolorBackdrop>
      <header className="login-header">
        <BrandMark locale={locale} />
        <LocaleToggle locale={locale} onChange={onLocaleChange} />
      </header>
      <main className="login-layout">
        <p className="login-layout__whisper">{locale === 'zh-CN' ? '回到自己的画里' : 'Return to your own art'}</p>
        <section className="login-panel">
          <h1>{COPY[locale].loginTitle}</h1>
          <div className="login-tabs">
            <button className={method === 'scan' ? 'is-active' : ''} type="button" onClick={() => setMethod('scan')}>
              {COPY[locale].scanLogin}
            </button>
            <button className={method === 'phone' ? 'is-active' : ''} type="button" onClick={() => setMethod('phone')}>
              {COPY[locale].phoneLogin}
            </button>
            <button className={method === 'email' ? 'is-active' : ''} type="button" onClick={() => setMethod('email')}>
              {COPY[locale].emailLogin}
            </button>
          </div>
          {method === 'scan' ? (
            <div className="qr-state">
              <button
                className="qr-code"
                type="button"
                onClick={startWechatLogin}
                aria-label="Start WeChat QR sign-in"
              />
              <p>{COPY[locale].scanHint}</p>
            </div>
          ) : (
            <div className="phone-state">
              <label>
                {method === 'phone' ? (locale === 'zh-CN' ? '手机号' : 'Phone number') : (locale === 'zh-CN' ? '邮箱' : 'Email address')}
                <input
                  inputMode={method === 'phone' ? 'tel' : 'email'}
                  placeholder={method === 'phone' ? '138 0000 0000' : 'you@example.com'}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                />
              </label>
              <button className="primary-button" type="button" onClick={sendCode}>
                {locale === 'zh-CN' ? '获取验证码' : 'Send code'}
              </button>
              <label>
                {locale === 'zh-CN' ? '验证码' : 'Verification code'}
                <input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} />
              </label>
              <button className="secondary-button" type="button" onClick={completeCodeLogin}>
                {COPY[locale].login}
              </button>
              {message && <p className="form-message">{message}</p>}
              <p>{method === 'phone' ? COPY[locale].phoneHint : COPY[locale].emailHint}</p>
            </div>
          )}
          <p className="login-panel__legal">
            {locale === 'zh-CN'
              ? '登录即表示你同意《用户协议》和《隐私政策》'
              : 'By continuing, you accept the Terms and Privacy Policy.'}
          </p>
        </section>
      </main>
    </WatercolorBackdrop>
  );
}
