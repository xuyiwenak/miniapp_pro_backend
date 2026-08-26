import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Locale } from '../i18n/copy';
import { COPY } from '../i18n/copy';
import { BrandMark } from '../components/BrandMark';
import { LocaleToggle } from '../components/LocaleToggle';
import { WatercolorBackdrop } from '../components/WatercolorBackdrop';
import { requestEmail, requestSms, startWechatLogin, verifyEmail, verifySms } from '../api/mandis';

const WECHAT_LOGIN_PATH = '/api/web-auth/wechat/start';

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
  const wechatLoginUrl = new URL(WECHAT_LOGIN_PATH, window.location.origin).toString();

  function changeMethod(nextMethod: 'email' | 'phone' | 'scan'): void {
    setMethod(nextMethod);
    setMessage('');
  }

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
          <div className="login-tabs" role="tablist" aria-label={COPY[locale].loginTitle}>
            <button
              aria-selected={method === 'scan'}
              className={method === 'scan' ? 'is-active' : ''}
              role="tab"
              type="button"
              onClick={() => changeMethod('scan')}
            >
              {COPY[locale].scanLogin}
            </button>
            <button
              aria-selected={method === 'phone'}
              className={method === 'phone' ? 'is-active' : ''}
              role="tab"
              type="button"
              onClick={() => changeMethod('phone')}
            >
              {COPY[locale].phoneLogin}
            </button>
            <button
              aria-selected={method === 'email'}
              className={method === 'email' ? 'is-active' : ''}
              role="tab"
              type="button"
              onClick={() => changeMethod('email')}
            >
              {COPY[locale].emailLogin}
            </button>
          </div>
          <div className="login-panel__body">
            {method === 'scan' ? (
              <div className="qr-state" role="tabpanel">
                <button
                  className="qr-code"
                  type="button"
                  onClick={startWechatLogin}
                  aria-label={COPY[locale].scanHint}
                >
                  <QRCodeSVG bgColor="#fffdfa" fgColor="#2f3230" level="M" size={184} value={wechatLoginUrl} />
                </button>
                <p>{COPY[locale].scanHint}</p>
                <span>{locale === 'zh-CN' ? '也可以点击二维码继续' : 'You can also click the code to continue'}</span>
              </div>
            ) : (
              <form
                className="phone-state"
                role="tabpanel"
                onSubmit={(event) => {
                  event.preventDefault();
                  void completeCodeLogin();
                }}
              >
                <label>
                  {method === 'phone'
                    ? (locale === 'zh-CN' ? '手机号' : 'Phone number')
                    : (locale === 'zh-CN' ? '邮箱' : 'Email address')}
                  <input
                    autoComplete={method === 'phone' ? 'tel' : 'email'}
                    inputMode={method === 'phone' ? 'tel' : 'email'}
                    placeholder={method === 'phone' ? '138 0000 0000' : 'you@example.com'}
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                  />
                </label>
                <label>
                  {locale === 'zh-CN' ? '验证码' : 'Verification code'}
                  <span className="verification-row">
                    <input
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                    />
                    <button type="button" onClick={sendCode}>
                      {locale === 'zh-CN' ? '获取验证码' : 'Send code'}
                    </button>
                  </span>
                </label>
                <button className="primary-button login-submit" type="submit">
                  {COPY[locale].login}
                </button>
                <p className="login-method-hint">
                  {method === 'phone' ? COPY[locale].phoneHint : COPY[locale].emailHint}
                </p>
                <p className="form-message" aria-live="polite">{message}</p>
              </form>
            )}
          </div>
          <p className="login-panel__legal">
            <span aria-hidden="true">✓</span>
            {locale === 'zh-CN' ? '我已阅读并同意《用户协议》和《隐私政策》' : 'I accept the Terms and Privacy Policy.'}
          </p>
        </section>
      </main>
    </WatercolorBackdrop>
  );
}
