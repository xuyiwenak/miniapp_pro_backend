import { sealText, type PatternState, type Preview } from '@pattern/contract';
import { Choices } from './controls';
export function PlatePreview({ preview, pending }: { preview: Preview | null; pending: boolean }) {
  return <figure className={`plate-preview ${pending ? 'updating' : ''}`} aria-busy={pending}>
    {preview?.plate ? <img src={preview.plate} alt="青花盘平面预览：盘心、固定留白与环形边饰" />
      : <div className="plate-placeholder">盘面预览</div>}
    <figcaption aria-live="polite">{pending ? '正在更新预览…' : '固定盘心 · 固定留白 · 精确平面预览'}</figcaption>
  </figure>;
}
export function PlateSettings({ state, onChange, preview }: {
  state: PatternState; onChange: (state: PatternState) => void; preview: Preview | null;
}) {
  const text = sealText(state.seal.name);
  return <><Choices label="盘面模板" value={state.template} items={[
    { value: 'single', label: '单圈边饰' }, { value: 'double', label: '双圈边饰' },
  ]} onChange={template => onChange({ ...state, template })} />
  <p className="locked-space">留白已固定，圈的宽度与位置无需调整。</p>
  <section className="seal-settings"><label className="pattern-toggle"><input type="checkbox"
    checked={state.seal.enabled}
    onChange={e => onChange({ ...state, seal: { ...state.seal, enabled: e.target.checked } })} />
      加一枚自己的印章</label>
  {state.seal.enabled && <><label>署名或艺名<input value={state.seal.name} placeholder="输入 2～4 个汉字，如黎明"
    aria-describedby="seal-help" onChange={e => onChange({ ...state, seal: { ...state.seal, name: e.target.value } })} /></label>
  <p id="seal-help" className="muted small">两字补“之印”，三字补“印”，四字直接使用。无需真实姓名。</p>
  <div className="seal-preview">{text && preview?.seal && <img src={preview.seal} alt={`四字方章：${text}`} />}
    <span>{text || '请输入 2～4 个汉字'}<small>右列从上到下，再读左列</small></span></div></>}
  </section></>;
}
