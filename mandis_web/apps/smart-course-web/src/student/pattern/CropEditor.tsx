import { useRef, type PointerEvent, type KeyboardEvent } from 'react';
import { cropPlacement } from '@pattern/geometry';
import type { Crop, PatternAssetView } from '@pattern/contract';
import { Choices } from './controls';
const EDGE = 320;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function CropEditor({ asset, crop, onChange }: {
  asset: PatternAssetView; crop: Crop; onChange: (crop: Crop) => void;
}) {
  const p = cropPlacement(asset.width, asset.height, crop, EDGE);
  const { points, move } = useCropGestures(crop, onChange);
  return <div className="crop-editor"><svg viewBox="0 0 320 320" role="img" tabIndex={0}
    aria-label="圆形取景框，可拖动、双指缩放或使用方向键移动图案" onKeyDown={event => cropKey(event, crop, onChange)}
    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId);
      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); }}
    onPointerMove={move} onPointerUp={event => points.current.delete(event.pointerId)}
    onPointerCancel={event => points.current.delete(event.pointerId)}>
    <defs><mask id="crop-outside"><rect width="320" height="320" fill="white" />
      <circle cx="160" cy="160" r="160" fill="black" /></mask></defs>
    <g transform={`translate(${160 + p.x},${160 + p.y}) rotate(${crop.rotation})`}>
      <image href={asset.imageUrl} x={-p.width / 2} y={-p.height / 2} width={p.width} height={p.height} />
    </g><rect width="320" height="320" fill="#17212b" opacity=".45" mask="url(#crop-outside)" />
    <circle cx="160" cy="160" r="159" fill="none" stroke="white" strokeWidth="2" /></svg>
  <p className="muted small">拖动调整位置 · 双指或滑杆缩放 · 圆外部分不会进入盘心</p>
  <label>缩放 {Math.round(crop.zoom * 100)}%<input aria-label="缩放" type="range" min="0.25" max="4"
    step="0.01" value={crop.zoom} onChange={e => onChange({ ...crop, zoom: Number(e.target.value) })} /></label>
  <Choices label="取景方式" value={crop.fit} items={[{ value: 'contain', label: '完整放入' },
    { value: 'cover', label: '铺满圆形' }]} onChange={fit => onChange({ ...crop, fit, zoom: 1, x: 0, y: 0 })} />
  <div className="actions"><button onClick={() => onChange({ ...crop, rotation: (crop.rotation + 90) % 360 })}>
      旋转 90°</button><button onClick={() => onChange({ x: 0, y: 0, zoom: 1, rotation: 0, fit: 'contain' })}>
        重置取景</button></div>
  </div>;
}

function useCropGestures(crop: Crop, onChange: (crop: Crop) => void) {
  const points = useRef(new Map<number, { x: number; y: number }>());
  function move(event: PointerEvent<SVGSVGElement>) {
    const old = points.current.get(event.pointerId); if (!old) return;
    const next = { x: event.clientX, y: event.clientY };
    const other = [...points.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
    points.current.set(event.pointerId, next);
    if (other) {
      const before = Math.hypot(old.x - other.x, old.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      if (before > 0) onChange({ ...crop, zoom: clamp(crop.zoom * after / before, 0.25, 4) });
      return;
    }
    const scale = EDGE / event.currentTarget.getBoundingClientRect().width;
    onChange({ ...crop, x: clamp(crop.x + (next.x - old.x) * scale / EDGE, -1, 1),
      y: clamp(crop.y + (next.y - old.y) * scale / EDGE, -1, 1) });
  }
  return { points, move };
}

function cropKey(event: KeyboardEvent<SVGSVGElement>, crop: Crop, onChange: (crop: Crop) => void) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  onChange({ ...crop, x: clamp(crop.x + (event.key === 'ArrowRight' ? 0.02 : 0)
      - (event.key === 'ArrowLeft' ? 0.02 : 0), -1, 1),
  y: clamp(crop.y + (event.key === 'ArrowDown' ? 0.02 : 0) - (event.key === 'ArrowUp' ? 0.02 : 0), -1, 1) });
}
