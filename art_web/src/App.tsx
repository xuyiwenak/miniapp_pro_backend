import { useState } from 'react';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import type { Locale } from './i18n/copy';
import { LocaleToggle } from './components/LocaleToggle';
import { SideNav } from './components/SideNav';
import type { ArtworkProgress } from './components/UploadCanvas';
import { UploadPage } from './pages/UploadPage';
import { LoginPage } from './pages/LoginPage';
import { beginAnalysis, publishArtwork, waitForAnalysis } from './api/mandis';
import { ReportsPage } from './pages/ReportsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportDetailPage } from './pages/ReportDetailPage';

const TOKEN_STORAGE_KEY = 'original-sense-web-token';

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
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? '');
  const navigate = useNavigate();
  function finishLogin(nextToken = ''): void {
    setToken(nextToken);
    sessionStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    navigate('/');
  }
  function signOut(): void {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken('');
    navigate('/');
  }
  if (!token) return <LoginPage locale={locale} onLocaleChange={setLocale} onLogin={finishLogin} />;
  return <AppLayout locale={locale} onLocaleChange={setLocale} onSignOut={signOut} token={token} />;
}

export default function App() {
  return (
    <BrowserRouter basename="/art">
      <ArtApp />
    </BrowserRouter>
  );
}
