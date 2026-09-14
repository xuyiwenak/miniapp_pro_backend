// Local-only fixture: the production Vite entry never imports this module.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HomeOutlined, AppstoreOutlined } from '@ant-design/icons';
import { ClassroomGallery } from '../src/classroom/components/ClassroomGallery';
import { ClassroomShell } from '../src/classroom/components/ClassroomShell';
import { ArtworkStep } from '../src/classroom/components/ArtworkStep';
import { GallerySharing } from '../src/classroom/components/GallerySharing';
import type { GalleryDetail, PeerAnswers, EvaluationInput } from '@mandis/common/classroom-types';
import './preview.css';
import '../src/student.css';
import '../src/classroom/classroom.css';
import '../src/classroom/reflectionDesign.css';
import '../src/classroom/gallery.css';
import artworkUrl from './artwork.jpg';

const originalFetch = window.fetch.bind(window);
let sharing = false;
let peerConsented = false;
const details: Record<string, GalleryDetail> = Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
  const galleryId = `00000000-0000-4000-8000-00000000000${index}`;
  return [galleryId, { galleryId, mine: index === 0, progress: 'not_started' }];
}));
window.fetch = async (resource, options) => {
  const url = String(resource);
  if (!url.includes('/api/classroom-participation/gallery')) return originalFetch(resource, options);
  const path = url.split('/gallery')[1];
  if (path.endsWith('/image')) return originalFetch(artworkUrl);
  const body = options?.body ? JSON.parse(String(options.body)) : {};
  if (path === '/sharing') { sharing = body.sharing; return json({ sharing }); }
  if (!path || path.startsWith('?')) return json({ sharing, readOnly: false, items: Object.values(details) });
  const [, id, stage] = path.split('/');
  const item = details[id];
  if (stage === 'independent') {
    item.independent = body.answers as PeerAnswers; peerConsented ||= body.consent;
    if (body.submit) {
      item.independentSubmittedAt = new Date().toISOString(); item.progress = 'independent_submitted';
      item.echo = { status: 'success', analysisRunId: id, reportVersion: id,
        modules: ['overallExpression', 'color', 'suggestion'], summary: '丰富的色彩与有序的排列，让画面呈现充满活力的感觉。',
        colorAnalysis: '多种明亮的颜色彼此交叠，形成鲜明的节奏。', suggestion: '可以尝试不同颜色的组合，探索新的表达。' };
    } else item.progress = 'draft';
  }
  if (stage === 'feedback') {
    item.moduleResponses = body.answers.moduleResponses as EvaluationInput['moduleResponses'];
    if (body.submit) { item.feedbackSubmittedAt = new Date().toISOString(); item.progress = 'completed'; }
  }
  return json({ ...item, peerConsented });
};
function json(data: unknown) { return new Response(JSON.stringify({ success: true, data }), { status: 200 }); }
function Preview() {
  const [page, setPage] = useState('gallery');
  return <ClassroomShell locale="zh-CN" onLocaleChange={() => {}}>
    {page === 'gallery' ? <ClassroomGallery token="local-preview-only" locale="zh-CN" />
      : <ArtworkStep locale="zh-CN" saving={false}
        sharing={<GallerySharing token="local-preview-only" locale="zh-CN" />}
        onUpload={async () => { setPage('gallery'); }} onTeacherUpload={async () => { setPage('gallery'); }}
        onConfirmTeacherUpload={() => setPage('gallery')} />}
    <nav className="gallery-navigation">
      <button aria-current={page === 'upload' ? 'page' : undefined} onClick={() => setPage('upload')}>
        <HomeOutlined />我的课堂</button>
      <button aria-current={page === 'gallery' ? 'page' : undefined} onClick={() => setPage('gallery')}>
        <AppstoreOutlined />课堂作品</button>
    </nav>
  </ClassroomShell>;
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />);
