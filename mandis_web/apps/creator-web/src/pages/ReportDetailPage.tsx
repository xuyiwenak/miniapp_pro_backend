import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getReport, type ReportDetail } from '../api/mandis';
import type { Locale } from '../i18n/copy';

type ReportDetailPageProps = { locale: Locale; token: string };

export function ReportDetailPage({ locale, token }: ReportDetailPageProps) {
  const { workId } = useParams();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!workId) return;
    getReport(workId, token).then(setReport).catch(() => {
      setError(locale === 'zh-CN' ? '暂时无法打开这份报告。' : 'This reflection is unavailable right now.');
    });
  }, [locale, token, workId]);

  if (error) return <main className="workspace"><p className="form-error">{error}</p></main>;
  if (!report) return <main className="workspace"><p>{locale === 'zh-CN' ? '正在打开报告…' : 'Opening reflection…'}</p></main>;
  const sections = [
    [locale === 'zh-CN' ? '色彩感受' : 'Colour reflection', report.colorAnalysis],
    [locale === 'zh-CN' ? '构图与节奏' : 'Composition and rhythm', report.compositionReport],
    [locale === 'zh-CN' ? '线条与情绪' : 'Line and emotion', report.lineAnalysis],
    [locale === 'zh-CN' ? '给你的建议' : 'A gentle next step', report.suggestion],
  ].filter((section): section is [string, string] => Boolean(section[1]));

  return (
    <main className="workspace report-detail">
      <Link className="back-link" to="/reports">← {locale === 'zh-CN' ? '返回报告' : 'Back to reports'}</Link>
      <section className="workspace__heading"><p className="workspace__eyebrow">{locale === 'zh-CN' ? '专属解读' : 'PRIVATE REFLECTION'}</p><h1>{report.dominantEmotionLabel}</h1></section>
      <img className="report-detail__cover" src={report.coverUrl} alt="" />
      <section className="report-detail__body">
        {report.desc && <p>{report.desc}</p>}
        {sections.map(([title, content]) => <article key={title}><h2>{title}</h2><p>{content}</p></article>)}
      </section>
    </main>
  );
}
