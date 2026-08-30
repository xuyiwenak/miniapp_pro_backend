import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import type { Locale } from './i18n/copy';
import { LocaleToggle } from './components/LocaleToggle';
import { SideNav } from './components/SideNav';
import type { ArtworkProgress } from './components/UploadCanvas';
import { UploadPage } from './pages/UploadPage';
import { LoginPage } from './pages/LoginPage';
import {
  beginAnalysis,
  getAuthProfile,
  logoutWebSession,
  publishArtwork,
  waitForAnalysis,
} from './api/mandis';
import { ReportsPage } from './pages/ReportsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { BrandMark } from './components/BrandMark';
import { WatercolorBackdrop } from './components/WatercolorBackdrop';
import { AUTH_SESSION_EXPIRED_EVENT } from './api/client';

type AuthStatus = 'checking' | 'authenticated' | 'anonymous';
const COOKIE_AUTH_TOKEN = '';
const LEGACY_TOKEN_STORAGE_KEY = 'original-sense-web-token';

function takeLegacyToken(): string {
  try {
    const token = sessionStorage.getItem(LEGACY_TOKEN_STORAGE_KEY) ?? COOKIE_AUTH_TOKEN;
    sessionStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    return token;
  } catch {
    return COOKIE_AUTH_TOKEN;
  }
}

function useSessionStatus(): [AuthStatus, (status: AuthStatus) => void] {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  useEffect(() => {
    let active = true;
    void getAuthProfile(takeLegacyToken())
      .then(() => { if (active) setAuthStatus('authenticated'); })
      .catch(() => { if (active) setAuthStatus('anonymous'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const expireSession = () => setAuthStatus('anonymous');
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, expireSession);
  }, []);
  return [authStatus, setAuthStatus];
}

function AppLayout({
  locale,
  onLocaleChange,
  onSignOut,
  token,
}: {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onSignOut: () => void;
  token: string;
}) {
  const navigate = useNavigate();

  async function submitArtwork(
    file: File,
    onProgress: (progress: ArtworkProgress) => void
  ): Promise<void> {
    const work = await publishArtwork(file, token, (percent) => {
      onProgress({ phase: 'uploading', percent });
    });
    onProgress({ phase: 'analyzing', percent: 0 });
    await beginAnalysis(work.workId, token);
    await waitForAnalysis(work.workId, token, (percent) => {
      onProgress({ phase: 'analyzing', percent });
    });
    navigate(`/reports/${work.workId}`);
  }

  return (
    <div className="app-frame">
      <SideNav locale={locale} onSignOut={onSignOut} />
      <div className="app-frame__content">
        <header className="workspace-header">
          <LocaleToggle locale={locale} onChange={onLocaleChange} />
        </header>
        <Routes>
          <Route path="/" element={<UploadPage locale={locale} onSubmit={submitArtwork} />} />
          <Route path="/reports" element={<ReportsPage locale={locale} token={token} />} />
          <Route path="/reports/:workId" element={<ReportDetailPage locale={locale} token={token} />} />
          <Route path="/profile" element={<ProfilePage locale={locale} token={token} />} />
        </Routes>
      </div>
    </div>
  );
}

function ArtApp() {
  const [locale, setLocale] = useState<Locale>('zh-CN');
  const [authStatus, setAuthStatus] = useSessionStatus();
  const navigate = useNavigate();

  function finishLogin(): void {
    setAuthStatus('authenticated');
    navigate('/');
  }

  function signOut(): void {
    setAuthStatus('anonymous');
    navigate('/');
    void logoutWebSession().catch(() => undefined);
  }

  if (authStatus === 'checking') return <SessionRestoreScreen locale={locale} />;
  if (authStatus === 'anonymous') {
    return <LoginPage locale={locale} onLocaleChange={setLocale} onLogin={finishLogin} />;
  }
  return (
    <AppLayout
      locale={locale}
      onLocaleChange={setLocale}
      onSignOut={signOut}
      token={COOKIE_AUTH_TOKEN}
    />
  );
}

function SessionRestoreScreen({ locale }: { locale: Locale }) {
  return (
    <WatercolorBackdrop>
      <main className="session-restore" aria-live="polite">
        <BrandMark locale={locale} />
        <span className="session-restore__spinner" aria-hidden="true" />
        <p>{locale === 'zh-CN' ? '正在恢复登录状态…' : 'Restoring your session…'}</p>
      </main>
    </WatercolorBackdrop>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/art">
      <ArtApp />
    </BrowserRouter>
  );
}
