import { useId, useState } from 'react';
import type { EchoResult } from '@mandis/common/classroom-types';
import './expressionCharts.css';

const AXES = [
  ['joy', '愉悦', 'Joy'], ['calm', '平静', 'Calm'], ['anxiety', '紧张', 'Tension'],
  ['fear', '害怕', 'Fear'], ['solitude', '独处感', 'Solitude'], ['passion', '热情', 'Passion'],
  ['social_aversion', '回避互动', 'Withdrawal'], ['vitality', '活力', 'Vitality'],
] as const;
const CENTER = 200;
const RADIUS = 122;
const LABEL_RADIUS = 166;
const GRID = [25, 50, 75, 100];
function point(index: number, radius: number) {
  const angle = -Math.PI / 2 + index * Math.PI / 4;
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}
function validScore(value: { score: number | null; assessable: boolean } | undefined):
  value is { score: number; assessable: boolean } {
  return Boolean(value?.assessable && value.score !== null && Number.isFinite(value.score)
    && value.score >= 0 && value.score <= 100);
}
type RadarProps = { dimensions: NonNullable<EchoResult['dimensions']>; zh: boolean };

function RadarCanvas({ dimensions, zh }: RadarProps) {
  const titleId = useId();
  const points = AXES.map(([code], index) => validScore(dimensions[code])
    ? point(index, RADIUS * dimensions[code].score! / 100) : null);
  const complete = points.every(Boolean);
  return (
    <svg viewBox="0 0 400 400" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{zh ? '作品八维情绪表达，缺失维度不补分' : 'Eight expression dimensions; missing values are not filled'}</title>
      {GRID.map((level) => <polygon key={level} className="expression-grid" points={AXES.map((_, index) => {
        const p = point(index, RADIUS * level / 100); return `${p.x},${p.y}`;
      }).join(' ')} />)}
      {complete && <polygon className="expression-area" points={points.map((p) => `${p!.x},${p!.y}`).join(' ')} />}
      {AXES.map(([code, cn, en], index) => {
        const end = point(index, RADIUS); const label = point(index, LABEL_RADIUS);
        const p = points[index]; const next = points[(index + 1) % points.length];
        return <g key={code}>
          <line className="expression-grid" x1={CENTER} y1={CENTER} x2={end.x} y2={end.y} />
          {p && next && <line className="expression-line" x1={p.x} y1={p.y} x2={next.x} y2={next.y} />}
          {p && <circle className="expression-dot" cx={p.x} cy={p.y} r="4" />}
          <text x={label.x} y={label.y} textAnchor="middle">{zh ? cn : en}
            <tspan x={label.x} dy="21">{p ? dimensions[code].score : '—'}</tspan></text>
        </g>;
      })}
    </svg>
  );
}

export function ExpressionRadar({ dimensions, zh }: RadarProps) {
  const [selected, setSelected] = useState<string>('joy');
  const complete = AXES.every(([code]) => validScore(dimensions[code]));
  return <div className="expression-radar">
    <p>{zh ? '作品呈现的表达强度 · 0–100' : 'Expressed intensity in the artwork · 0–100'}</p>
    <RadarCanvas dimensions={dimensions} zh={zh} />
    {!complete && <p>{zh ? '— 表示证据不足；缺失位置不连线、不补 0。' : '— means insufficient evidence. Gaps are not filled.'}</p>}
    <div className="expression-evidence-choices" aria-label={zh ? '选择维度查看依据' : 'Select a dimension for evidence'}>
      {AXES.map(([code, cn, en]) => <button key={code} type="button" aria-pressed={selected === code}
        onClick={() => setSelected(code)}>{zh ? cn : en}</button>)}
    </div>
    <ul aria-live="polite">{(dimensions[selected]?.evidence ?? [zh ? '未提供依据' : 'No evidence supplied'])
      .map((text, index) => <li key={index}>{text}</li>)}</ul>
  </div>;
}
