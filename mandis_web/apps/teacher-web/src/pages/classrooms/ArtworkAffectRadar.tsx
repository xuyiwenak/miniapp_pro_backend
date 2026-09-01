import type { ClassroomAssessmentSummary } from '@/api/classroomApi';

const VIEWBOX_SIZE = 520;
const CHART_CENTER = VIEWBOX_SIZE / 2;
const CHART_RADIUS = 148;
const LABEL_RADIUS = 202;
const GRID_LEVELS = [0.25, 0.5, 0.75, 1];

type Dimension = ClassroomAssessmentSummary['artworkAffectSummary']['dimensions'][number];

function pointAt(index: number, count: number, radius: number): { x: number; y: number } {
  const angle = -Math.PI / 2 - (index * Math.PI * 2) / count;
  return {
    x: CHART_CENTER + radius * Math.cos(angle),
    y: CHART_CENTER + radius * Math.sin(angle),
  };
}

function polygonPoints(dimensions: Dimension[], ratio: (dimension: Dimension) => number): string {
  return dimensions.map((dimension, index) => {
    const point = pointAt(index, dimensions.length, CHART_RADIUS * ratio(dimension));
    return `${point.x},${point.y}`;
  }).join(' ');
}

function formatMean(mean: number | null): string {
  if (mean === null) return '—';
  return Number.isInteger(mean) ? String(mean) : mean.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function labelAnchor(x: number): 'start' | 'middle' | 'end' {
  const offset = x - CHART_CENTER;
  if (Math.abs(offset) < CHART_RADIUS / 2) return 'middle';
  return offset > 0 ? 'start' : 'end';
}

export function ArtworkAffectRadar({ dimensions }: { dimensions: Dimension[] }) {
  const hasCompleteSeries = dimensions.length >= 3 && dimensions.every(({ mean }) => mean !== null);
  const dataPoints = hasCompleteSeries
    ? polygonPoints(dimensions, ({ mean }) => Math.max(0, Math.min(1, (mean ?? 0) / 100)))
    : '';

  return (
    <div className="artwork-affect-radar">
      <svg
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        role="img"
        aria-labelledby="artwork-affect-radar-title artwork-affect-radar-description"
      >
        <title id="artwork-affect-radar-title">班级八维作品表达雷达图</title>
        <desc id="artwork-affect-radar-description">
          八个维度均使用零到一百分的作品表达标注量尺。
        </desc>
        <defs>
          <linearGradient id="artwork-affect-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4dbfb4" stopOpacity="0.48" />
            <stop offset="100%" stopColor="#1b3a6b" stopOpacity="0.24" />
          </linearGradient>
        </defs>
        {GRID_LEVELS.map((level) => (
          <polygon
            key={level}
            className={level === 1 ? 'is-outer-grid' : ''}
            points={polygonPoints(dimensions, () => level)}
          />
        ))}
        {dimensions.map((dimension, index) => {
          const endpoint = pointAt(index, dimensions.length, CHART_RADIUS);
          return <line key={dimension.code} x1={CHART_CENTER} y1={CHART_CENTER} x2={endpoint.x} y2={endpoint.y} />;
        })}
        {hasCompleteSeries && <polygon className="artwork-affect-radar__area" points={dataPoints} />}
        {hasCompleteSeries && dimensions.map((dimension, index) => {
          const point = pointAt(index, dimensions.length, CHART_RADIUS * ((dimension.mean ?? 0) / 100));
          return <circle key={dimension.code} cx={point.x} cy={point.y} r="4" />;
        })}
        {dimensions.map((dimension, index) => {
          const point = pointAt(index, dimensions.length, LABEL_RADIUS);
          return (
            <text key={dimension.code} x={point.x} y={point.y - 7} textAnchor={labelAnchor(point.x)}>
              <tspan className="artwork-affect-radar__label">{dimension.label}</tspan>
              <tspan className="artwork-affect-radar__score" x={point.x} dy="21">{formatMean(dimension.mean)}</tspan>
            </text>
          );
        })}
      </svg>
      {!hasCompleteSeries && (
        <span className="artwork-affect-radar__empty">维度数据不足，暂不绘制数据轮廓</span>
      )}
      <div className="artwork-affect-radar__details" aria-label="八维作品表达明细">
        {dimensions.map((dimension) => (
          <span key={dimension.code}>
            <strong>{dimension.label} {formatMean(dimension.mean)}</strong>
            <small>主导 {dimension.dominantCount} · n={dimension.count}</small>
          </span>
        ))}
      </div>
    </div>
  );
}
