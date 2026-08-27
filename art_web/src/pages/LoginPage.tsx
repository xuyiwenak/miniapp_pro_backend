import { useState, type FormEvent } from 'react';
import type { Locale } from '../i18n/copy';
import { COPY } from '../i18n/copy';
import { BrandMark } from '../components/BrandMark';
import { LocaleToggle } from '../components/LocaleToggle';
import { WatercolorBackdrop } from '../components/WatercolorBackdrop';
import {
  loginWithEmailPassword,
  requestPasswordReset,
  requestSms,
  resetEmailPassword,
  verifySms,
} from '../api/mandis';

type LoginMethod = 'email' | 'phone';
type EmailView = 'login' | 'reset';

type LoginPageProps = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onLogin: () => void;
};

type EmailFormProps = {
  locale: Locale;
  isBusy: boolean;
  onLogin: (email: string, password: string) => Promise<void>;
  onShowReset: (email: string) => void;
};

type ResetFormProps = {
  initialEmail: string;
  locale: Locale;
  isBusy: boolean;
  onBack: () => void;
  onReset: (email: string, code: string, password: string) => Promise<void>;
  onSendCode: (email: string) => Promise<void>;
};

type PhoneFormProps = {
  locale: Locale;
  isBusy: boolean;
  onLogin: (phone: string, code: string) => Promise<void>;
  onSendCode: (phone: string) => Promise<void>;
};

function EmailLoginForm({ locale, isBusy, onLogin, onShowReset }: EmailFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void onLogin(email, password);
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        {COPY[locale].emailLabel}
        <input
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        {COPY[locale].passwordLabel}
        <input
          autoComplete="current-password"
          minLength={8}
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button className="login-text-action" type="button" onClick={() => onShowReset(email)}>
        {COPY[locale].forgotOrSetPassword}
      </button>
      <button className="primary-button login-submit" disabled={isBusy} type="submit">
        {isBusy ? COPY[locale].signingIn : COPY[locale].login}
      </button>
      <p className="login-method-hint">{COPY[locale].emailHint}</p>
    </form>
  );
}

function PasswordResetForm(props: ResetFormProps) {
  const { initialEmail, locale, isBusy, onBack, onReset, onSendCode } = props;
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const passwordsMatch = password === confirmation;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (passwordsMatch) void onReset(email, code, password);
  }

  return (
    <form className="login-form login-form--reset" onSubmit={submit}>
      <button className="login-back-action" type="button" onClick={onBack}>
        ← {COPY[locale].backToLogin}
      </button>
      <label>
        {COPY[locale].emailLabel}
        <input
          autoComplete="email"
          inputMode="email"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        {COPY[locale].verificationCode}
        <span className="verification-row">
          <input
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]{6}"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <button disabled={isBusy || !email} type="button" onClick={() => void onSendCode(email)}>
            {COPY[locale].sendCode}
          </button>
        </span>
      </label>
      <div className="password-pair">
        <label>
          {COPY[locale].newPassword}
          <input
            autoComplete="new-password"
            minLength={8}
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          {COPY[locale].confirmPassword}
          <input
            aria-invalid={Boolean(confirmation) && !passwordsMatch}
            autoComplete="new-password"
            minLength={8}
            required
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
      </div>
      {!passwordsMatch && confirmation && <p className="field-error">{COPY[locale].passwordMismatch}</p>}
      <button className="primary-button login-submit" disabled={isBusy || !passwordsMatch} type="submit">
        {COPY[locale].setPassword}
      </button>
    </form>
  );
}

function PhoneLoginForm({ locale, isBusy, onLogin, onSendCode }: PhoneFormProps) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void onLogin(phone, code);
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label>
        {COPY[locale].phoneLabel}
        <input
          autoComplete="tel"
          inputMode="tel"
          pattern="1[0-9]{10}"
          placeholder="138 0000 0000"
          required
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>
      <label>
        {COPY[locale].verificationCode}
        <span className="verification-row">
          <input
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]{6}"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <button disabled={isBusy || !phone} type="button" onClick={() => void onSendCode(phone)}>
            {COPY[locale].sendCode}
          </button>
        </span>
      </label>
      <button className="primary-button login-submit" disabled={isBusy} type="submit">
        {isBusy ? COPY[locale].signingIn : COPY[locale].login}
      </button>
      <p className="login-method-hint">{COPY[locale].phoneHint}</p>
    </form>
  );
}

export function LoginPage({ locale, onLocaleChange, onLogin }: LoginPageProps) {
  const [method, setMethod] = useState<LoginMethod>('email');
  const [emailView, setEmailView] = useState<EmailView>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  function changeMethod(nextMethod: LoginMethod): void {
    setMethod(nextMethod);
    setEmailView('login');
    setMessage('');
  }

  async function runAction(action: () => Promise<void>): Promise<void> {
    setIsBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : COPY[locale].genericError);
    } finally {
      setIsBusy(false);
    }
  }

  function completeEmailLogin(email: string, password: string): Promise<void> {
    return runAction(async () => {
      await loginWithEmailPassword(email, password);
      onLogin();
    });
  }

  function completePhoneLogin(phone: string, code: string): Promise<void> {
    return runAction(async () => {
      await verifySms(phone, code);
      onLogin();
    });
  }

  function sendResetCode(email: string): Promise<void> {
    return runAction(async () => {
      await requestPasswordReset(email, locale);
      setMessage(COPY[locale].codeSent);
    });
  }

  function sendPhoneCode(phone: string): Promise<void> {
    return runAction(async () => {
      await requestSms(phone);
      setMessage(COPY[locale].codeSent);
    });
  }

  function completePasswordReset(email: string, code: string, password: string): Promise<void> {
    return runAction(async () => {
      await resetEmailPassword(email, code, password);
      setEmailView('login');
      setMessage(COPY[locale].passwordUpdated);
    });
  }

  function showPasswordReset(email: string): void {
    setResetEmail(email);
    setEmailView('reset');
    setMessage('');
  }

  return (
    <WatercolorBackdrop>
      <header className="login-header">
        <BrandMark locale={locale} />
        <LocaleToggle locale={locale} onChange={onLocaleChange} />
      </header>
      <main className="login-layout">
        <p className="login-layout__whisper">
          {locale === 'zh-CN' ? '回到自己的画里' : 'Return to your own art'}
        </p>
        <section className={`login-panel${emailView === 'reset' ? ' login-panel--reset' : ''}`}>
          <h1>{emailView === 'reset' ? COPY[locale].resetPasswordTitle : COPY[locale].loginTitle}</h1>
          <div className="login-tabs" role="tablist" aria-label={COPY[locale].loginTitle}>
            <button
              aria-selected={method === 'email'}
              className={method === 'email' ? 'is-active' : ''}
              role="tab"
              type="button"
              onClick={() => changeMethod('email')}
            >
              {COPY[locale].emailLogin}
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
          </div>
          <div className="login-panel__body" role="tabpanel">
            {method === 'email' && emailView === 'login' && (
              <EmailLoginForm
                isBusy={isBusy}
                locale={locale}
                onLogin={completeEmailLogin}
                onShowReset={showPasswordReset}
              />
            )}
            {method === 'email' && emailView === 'reset' && (
              <PasswordResetForm
                initialEmail={resetEmail}
                isBusy={isBusy}
                locale={locale}
                onBack={() => setEmailView('login')}
                onReset={completePasswordReset}
                onSendCode={sendResetCode}
              />
            )}
            {method === 'phone' && (
              <PhoneLoginForm
                isBusy={isBusy}
                locale={locale}
                onLogin={completePhoneLogin}
                onSendCode={sendPhoneCode}
              />
            )}
          </div>
          <p className="form-message" aria-live="polite">{message}</p>
          <p className="login-panel__legal">
            <span aria-hidden="true">✓</span>
            {locale === 'zh-CN'
              ? '我已阅读并同意《用户协议》和《隐私政策》'
              : 'I accept the Terms and Privacy Policy.'}
          </p>
        </section>
      </main>
    </WatercolorBackdrop>
  );
}
