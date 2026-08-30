import type { Locale } from '../i18n/copy';
import type { ArtworkProgress } from '../components/UploadCanvas';
import { COPY } from '../i18n/copy';
import { UploadCanvas } from '../components/UploadCanvas';

type UploadPageProps = {
  locale: Locale;
  onSubmit: (file: File, onProgress: (progress: ArtworkProgress) => void) => Promise<void>;
};

export function UploadPage({ locale, onSubmit }: UploadPageProps) {
  return (
    <main className="workspace">
      <section className="workspace__heading">
        <p className="workspace__eyebrow">{locale === 'zh-CN' ? '今日创作' : 'TODAY’S CREATION'}</p>
        <h1>{COPY[locale].uploadTitle}</h1>
        <p>{COPY[locale].uploadDescription}</p>
      </section>
      <div className="workspace__grid">
        <UploadCanvas locale={locale} onSubmit={onSubmit} />
        <aside className="privacy-note">
          <span aria-hidden="true">♧</span>
          <h2>{COPY[locale].privacyTitle}</h2>
          <p>{COPY[locale].privacyBody}</p>
        </aside>
      </div>
      <section className="recent-report">
        <p>
          {COPY[locale].recentReports}
          <span aria-hidden="true">✦</span>
        </p>
        <div className="recent-report__row">
          <div className="recent-report__art" />
          <div>
            <strong>{locale === 'zh-CN' ? '春日的光' : 'Spring Light'}</strong>
            <span>2026-08-25 · 14:32</span>
            <button type="button">{COPY[locale].viewReport} ›</button>
          </div>
        </div>
      </section>
    </main>
  );
}
