import { useState } from 'react';
import { Alert, Button, Card, Image, Modal, Space, Tag, Typography, Checkbox } from 'antd';
import { http } from '../../api/client';
import type { EchoResult } from '@mandis/common/classroom-types';

const STATUS_LABELS: Record<string, string> = { preparing: '正在生成解读', review: '待检查', approved: '已通过',
  rejected: '未通过', failed: '生成失败，可重新上传重试', withdrawn: '已退出展示' };
function ReportPreview({ json }: { json: string }) {
  let report: EchoResult;
  try { report = JSON.parse(json) as EchoResult; }
  catch { return <Alert type="error" message="解读格式异常，请重新生成" />; }
  const sections = [['整体表达', report.summary], ['色彩', report.colorAnalysis], ['线条', report.lineAnalysis],
    ['构图', report.compositionReport], ['情绪与 VAD', report.emotionVad?.interpretation],
    ['画内文字', report.embeddedText], ['可以试试', report.suggestion]];
  return <>{sections.filter(([, text]) => text).map(([title, text]) => <section key={title}>
    <Typography.Text strong>{title}</Typography.Text><Typography.Paragraph>{text}</Typography.Paragraph>
  </section>)}</>;
}

interface GalleryVersion {
  galleryId: string; status: string; current: boolean; imageUrl: string; reportJson?: string;
  errorCode?: string; imageApproved?: boolean; counts: { independent: number; completed: number };
}
interface GalleryAuthor {
  participantId: string; classroomCode: string; sourceUrl?: string; versions: GalleryVersion[];
}
export function ClassroomGalleryPanel({ classId, readOnly }: { classId: string; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [authors, setAuthors] = useState<GalleryAuthor[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const base = `/api/teacher/classrooms/${classId}/gallery`;
  async function load() {
    setBusy(true); setError('');
    try { setAuthors((await http.get<GalleryAuthor[]>(base)).data); }
    catch (e) { setError(e instanceof Error ? e.message : '读取失败'); }
    finally { setBusy(false); }
  }
  async function prepare(participantId: string, file: File) {
    setBusy(true); setError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file);
      });
      await http.post(`${base}/prepare`, { participantId, dataUrl }, { timeout: 60000 });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : '处理失败'); }
    finally { setBusy(false); }
  }
  async function review(galleryId: string, approved: boolean, imageOnly = false) {
    setBusy(true); setError('');
    try { await http.post(`${base}/${galleryId}/review`, { approved, imageOnly }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败'); }
    finally { setBusy(false); }
  }
  return <>
    <Button onClick={() => { setOpen(true); void load(); }}>课堂作品廊与匿名评价</Button>
    <Modal title="课堂作品廊 · 匿名检查与进度" width={900} open={open} onCancel={() => setOpen(false)} footer={null}>
      <Alert type="info" showIcon message="仅展示学生主动同意的作品"
        description="请在本地处理姓名、落款、二维码等身份线索后上传展示版本。系统将为该图片单独生成 AI 解读，确认图片和文字均无身份线索后再通过审核。" />
      <Button onClick={() => void load()} loading={busy} style={{ marginBlock: 16 }}>刷新状态</Button>
      {error && <Alert type="error" message={error} />}
      {!authors.length && <p>暂无学生同意展示作品。</p>}
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {authors.map((author) => <Card key={author.participantId} title={`作品 · ${author.classroomCode}`}>
          {author.sourceUrl ? <Image src={author.sourceUrl} width={160} alt="待处理的原作品" /> : <p>等待作品上传</p>}
          {!readOnly && author.sourceUrl && <label style={{ display: 'block', marginBlock: 12 }}>
            上传已去标识的展示图片
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
                if (file) void prepare(author.participantId, file);
              }} />
          </label>}
          {author.versions.map((version) => <Card key={version.galleryId} size="small" style={{ marginTop: 12 }}>
            <Space><Image src={version.imageUrl} width={120} alt="匿名展示图片" />
              <Tag>{version.current ? '当前作品版本' : '旧作品版本'}</Tag>
              <Tag>{STATUS_LABELS[version.status] ?? version.status}</Tag></Space>
            <p>独立评价 {version.counts.independent} 人 / 目标 3 人 · AI 对照完成 {version.counts.completed} 人</p>
            {version.counts.independent < 3 && <Tag color="orange">尚缺 {3 - version.counts.independent} 名独立评价者</Tag>}
            {version.errorCode && <Alert type="warning" message={version.errorCode === 'POTENTIAL_IDENTIFYING_TEXT'
              ? '检测到身份线索，请修正展示图片' : 'AI 解读生成失败，请重新上传该图片重试'} />}
            {version.reportJson && <details><summary>检查 AI 文字</summary>
              <ReportPreview json={version.reportJson} /></details>}
            {!readOnly && version.current && version.status !== 'withdrawn' && <>
              <Checkbox checked={checked[version.galleryId] ?? false}
                onChange={(e) => setChecked({ ...checked, [version.galleryId]: e.target.checked })}>
                我已检查展示图片（及已生成的 AI 文字），不包含作者身份线索
              </Checkbox>
              <Space style={{ marginTop: 12 }}>
                <Button disabled={!checked[version.galleryId] || busy || Boolean(version.imageApproved)}
                  onClick={() => void review(version.galleryId, true, true)}>图片通过，允许独立评价</Button>
                <Button type="primary" disabled={!checked[version.galleryId] || busy || Boolean(version.errorCode)
                  || !version.reportJson}
                  onClick={() => void review(version.galleryId, true)}>AI 文字通过，允许解锁</Button>
                <Button disabled={busy} onClick={() => void review(version.galleryId, false)}>不展示 / 下架</Button>
              </Space>
            </>}
          </Card>)}
        </Card>)}
      </Space>
    </Modal>
  </>;
}
