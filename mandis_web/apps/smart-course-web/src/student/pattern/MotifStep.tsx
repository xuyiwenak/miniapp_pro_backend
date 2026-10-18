import { PALETTES, type PatternAssetView, type PatternState, type Preview } from '@pattern/contract';
import { CropEditor } from './CropEditor';
import { Choices, UploadButton } from './controls';
export function MotifStep({ state, asset, preview, onChange, onUpload, busy }: {
  state: PatternState; asset?: PatternAssetView; preview: Preview | null; busy: boolean;
  onChange: (state: PatternState) => void; onUpload: (file: File) => void;
}) {
  return <><header className="pattern-heading"><span>01 / 从一笔开始</span><h1>我的纹样</h1>
    <p>在白纸上画一个独立图案，拍下你自己的创作。</p></header>
  {!asset && <div className="pattern-empty"><div className="empty-flower" aria-hidden="true">✳</div>
    <h2>今天，从你的一个小图案开始</h2><p>花、叶、线条都可以。拍照时保持纸面平整、光线均匀。</p></div>}
  <UploadButton label={asset ? '更换我的纹样' : '上传我的纹样'} disabled={busy} onFile={onUpload} />
  <p className="muted small">JPG / PNG / WebP · 不超过 10 MB · 请上传自己的或有权使用的图案</p>
  {asset && <CropEditor asset={asset} crop={state.crop} onChange={crop => onChange({ ...state, crop })} />}
  <BackgroundControls state={state} onChange={onChange} />
  <Choices label="选择青花色" value={state.palette} items={Object.entries(PALETTES).map(([value, p]) =>
    ({ value: value as PatternState['palette'], label: p.label }))}
  onChange={palette => onChange({ ...state, palette })} />
  {asset && preview?.center && <figure className="motif-result"><img src={preview.center} alt="取景与配色后的盘心纹样" />
    <figcaption>处理效果 · 原稿会保留，所有边饰使用同一青花色。</figcaption></figure>}
  </>;
}
function BackgroundControls({ state, onChange }: {
  state: PatternState; onChange: (state: PatternState) => void;
}) {
  return <div className="pattern-control"><label className="pattern-toggle"><input type="checkbox"
    checked={state.removeWhite} onChange={e => onChange({ ...state, removeWhite: e.target.checked })} />去除白纸背景</label>
  {state.removeWhite && <label className="muted small">去白底强度<input aria-label="去白底强度" type="range"
    min="180" max="250" value={430 - state.whiteThreshold}
    onChange={e => onChange({ ...state, whiteThreshold: 430 - Number(e.target.value) })} /></label>}
  <p className="muted small">淡笔画消失时降低强度，或关闭去白底；不会自动补画。</p></div>;
}
