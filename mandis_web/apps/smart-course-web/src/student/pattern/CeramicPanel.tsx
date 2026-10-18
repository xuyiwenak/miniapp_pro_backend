import type { CeramicView } from '@pattern/contract';
import { useCeramic } from './useCeramic';
export function CeramicPanel({ courseId, token, revision, current, closed, ready }: {
  courseId: string; token: string; revision: number; current: boolean; closed: boolean; ready: boolean;
}) {
  const { jobs, job, error, busy, loading, generate } = useCeramic(courseId, token, revision);
  const output = job?.status === 'success' ? job : jobs.find(item => item.status === 'success');
  const label = job ? '重新生成陶瓷效果图' : '生成陶瓷效果图';
  return <section className="ceramic-panel" aria-label="陶瓷实物效果图">
    <h2>看看做成瓷盘的样子</h2><p className="muted">可选体验。AI 添加釉面、厚度与光影，盘面设计单独保留。</p>
    {output?.imageUrl && <figure className="plate-preview"><img src={output.imageUrl} alt="陶瓷实物效果图，AI 效果参考" />
      <figcaption>AI 效果参考 · 1024 × 1024 · 设计版本 {output.revision}</figcaption>
      <a className="pattern-download" href={output.imageUrl} target="_blank" rel="noreferrer">打开陶瓷效果图</a></figure>}
    {output && (output.revision !== revision || !current) &&
      <p className="notice">这张效果图对应之前保存的设计。新设计保存后，可另行生成效果图。</p>}
    <CeramicStatus status={job?.status} />
    {error && <p className="notice" role="alert">{error}</p>}
    {(!job || job.status === 'failed') && <button className="primary"
      disabled={loading || busy || closed || !current || !ready} onClick={() => void generate()}>
      {busy ? '正在提交…' : label}</button>}
    {!ready && <p className="muted">陶瓷效果服务尚未配置。</p>}
    {!current && <p className="muted small">先保存最新盘面，再生成对应的陶瓷效果图。</p>}
    <p className="muted small">AI 可能改变细节，准确纹样和印章以“我的盘面设计”为准。无需生成效果图也能完成创作。</p>
    {jobs.filter(item => item.imageUrl).length > 1 && <details><summary>以前的陶瓷效果图</summary>
      {jobs.filter(item => item.imageUrl).map(item => <p key={item.revision}><a href={item.imageUrl}
        target="_blank" rel="noreferrer">设计版本 {item.revision} · AI 效果参考</a></p>)}</details>}
  </section>;
}
function CeramicStatus({ status }: { status?: CeramicView['status'] }) {
  if (status === 'pending' || status === 'submitting') {
    return <p className="notice" role="status" aria-live="polite">正在制作陶瓷效果图…完成后会自动保存，刷新不会重复生成。</p>;
  }
  if (status === 'success') return <p className="pattern-completed" role="status">✓ 陶瓷效果图已单独保存</p>;
  if (status === 'failed') return <p className="notice">这次生成未成功，盘面设计已保留，可以手动重试。</p>;
  if (status === 'unknown') return <p className="notice" role="status">
    生成状态暂时无法确认。为避免重复计费，已暂停重新生成，请联系教师核查。</p>;
  return null;
}
