import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listReports, type ReportItem } from '../api/mandis';
import type { Locale } from '../i18n/copy';

type ReportsPageProps = { locale: Locale; token: string };

export function ReportsPage({ locale, token }: ReportsPageProps) {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    listReports(token)
      .then(setReports)
      .catch(() => setError(locale === 'zh-CN' ? '暂时无法读取报告。' : 'Reports are unavailable right now.'));
  }, [locale, token]);

  return (
    <main className="workspace">
      <section className="workspace__heading">
        <p className="workspace__eyebrow">{locale === 'zh-CN' ? '你的创作档案' : 'YOUR ART ARCHIVE'}</p>
        <h1>{locale === 'zh-CN' ? '我的报告' : 'My reflections'}</h1>
      </section>
      {error && <p className="form-error">{error}</p>}
      <section className="report-list">
        {reports.map((report) => (
          <article className="report-card" key={report.workId}>
            <img src={report.coverUrl} alt="" />
            <div>
              <strong>{report.dominantEmotionLabel}</strong>
              <p>{report.desc}</p>
              <Link to={`/reports/${report.workId}`}>{locale === 'zh-CN' ? '查看报告' : 'View reflection'}</Link>
            </div>
          </article>
        ))}
        {!error && reports.length === 0 && (
          <p>
            {locale === 'zh-CN'
              ? '第一份报告会在作品解读完成后出现。'
              : 'Your first reflection will appear after analysis finishes.'}
          </p>
        )}
      </section>
    </main>
  );
}
