import { COUNTS, RULES, ORIENTATIONS, type PatternAssetView, type Ring } from '@pattern/contract';
import { PRESETS, presetSvg } from '@pattern/presets';
import { Choices, UploadButton } from './controls';
export function svgUri(svg: string) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }
export function RingControls({ ring, onChange, onUpload, busy, assets, centerId }: {
  ring: Ring; onChange: (ring: Ring) => void; onUpload: (file: File) => void; busy: boolean;
  assets: PatternAssetView[]; centerId: string;
}) {
  const band = ring.source === 'preset' && ring.presetId === 'wave';
  return <><Choices label="边饰来自哪里" value={ring.source} items={[
    { value: 'preset', label: '预设图案' }, { value: 'center', label: '我的纹样' }, { value: 'upload', label: '另传边饰' },
  ]} onChange={source => onChange({ ...ring, source })} />
  {ring.source === 'preset' && <div className="preset-grid" role="group" aria-label="预设边饰图案">
    {PRESETS.map(item => <button key={item.id} aria-pressed={item.id === ring.presetId}
      onClick={() => onChange({ ...ring, presetId: item.id })}>
      <img src={svgUri(presetSvg(item.id))} alt="" /><span>{item.label}</span>
      <small>{item.mode === 'band' ? '连续花边' : '单独图案'}</small></button>)}</div>}
  {ring.source === 'upload' && <><UploadButton label="上传边饰图案" disabled={busy} onFile={onUpload} />
    {ring.assetId && <img className="border-source" src={assets.find(a => a.assetId === ring.assetId)?.imageUrl}
      alt="单独上传的边饰原图" />}<p className="muted small">整张图作为单元，自动去除透明空边；长边保持原比例。</p></>}
  {ring.source === 'center' && <p className="muted small">{centerId ? '使用已取景的盘心图案，顶部朝上。' : '请先上传盘心纹样。'}</p>}
  {!band && <Choices label="排列规则" value={ring.rule} items={Object.entries(RULES).map(([value, label]) =>
    ({ value: value as Ring['rule'], label }))} onChange={rule => onChange({ ...ring, rule })} />}
  <Choices label={band ? '花边周期数' : '重复数量'} value={ring.count}
    items={COUNTS.map(value => ({ value, label: `${value}` }))} onChange={count => onChange({ ...ring, count })} />
  {!band && <Choices label="图案顶部的朝向" value={ring.orientation}
    items={Object.entries(ORIENTATIONS).map(([value, label]) => ({ value: value as Ring['orientation'], label }))}
    onChange={orientation => onChange({ ...ring, orientation })} />}
  <p className="muted small">{band ? '预设连续花边随环带弯曲，首尾相接。' : '绕圆排列，保留原形。数量越多，每个图案越小。'}</p>
  </>;
}
