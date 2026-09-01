import { useId } from 'react';

const VIEWBOX_SIZE = 520;
const CHART_CENTER = VIEWBOX_SIZE / 2;
const CHART_RADIUS = 148;
const LABEL_RADIUS = 202;
const GRID_LEVELS = [0.25, 0.5, 0.75, 1];

type ArtworkAffectRadarDimension = {
  code: string;
  label: string;
  score: number | null;
  assessable: boolean;
};

function pointAt(index: number, count: number, radius: number): { x: number; y: number } {
  const angle = -Math.PI / 2 - (index * Math.PI * 2) / count;
  return {
    x: CHART_CENTER + radius * Math.cos(angle),
    y: CHART_CENTER + radius * Math.sin(angle),
  };
}

function polygonPoints(
  dimensions: ArtworkAffectRadarDimension[],
  ratio: (dimension: ArtworkAffectRadarDimension) => number,
): string {
  return dimensions.map((dimension, index) => {
    const point = pointAt(index, dimensions.length, CHART_RADIUS * ratio(dimension));
    return `${point.x},${point.y}`;
  }).join(' ');
}

function formatScore(score: number | null): string {
  if (score === null) return '—';
  return Number.isInteger(score) ? String(score) : score.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function scoreRatio(score: number | null): number {
  return Math.max(0, Math.min(1, (score ?? 0) / 100));
}

function labelAnchor(x: number): 'start' | 'middle' | 'end' {
  const offset = x - CHART_CENTER;
  if (Math.abs(offset) < CHART_RADIUS / 2) return 'middle';
  return offset > 0 ? 'start' : 'end';
}

function RadarGrid({ dimensions }: { dimensions: ArtworkAffectRadarDimension[] }) {
  return (
    <>
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
    </>
  );
}

function RadarLabels({ dimensions }: { dimensions: ArtworkAffectRadarDimension[] }) {
  return dimensions.map((dimension, index) => {
    const point = pointAt(index, dimensions.length, LABEL_RADIUS);
    return (
      <text key={dimension.code} x={point.x} y={point.y - 7} textAnchor={labelAnchor(point.x)}>
        <tspan className="artwork-affect-radar__label">{dimension.label}</tspan>
        <tspan className="artwork-affect-radar__score" x={point.x} dy="21">
          {formatScore(dimension.score)}
        </tspan>
      </text>
    );
  });
}

function RadarSeries({ dimensions, gradientId }: {
  dimensions: ArtworkAffectRadarDimension[];
  gradientId: string;
}) {
  const dataPoints = polygonPoints(
    dimensions,
    ({ score }) => scoreRatio(score),
  );
  return (
    <>
      <polygon
        className="artwork-affect-radar__area"
        points={dataPoints}
        style={{ fill: `url(#${gradientId})` }}
      />
      {dimensions.map((dimension, index) => {
        const point = pointAt(index, dimensions.length, CHART_RADIUS * scoreRatio(dimension.score));
        return <circle key={dimension.code} cx={point.x} cy={point.y} r="4" />;
      })}
    </>
  );
}

export function ArtworkAffectRadar({ dimensions }: { dimensions: ArtworkAffectRadarDimension[] }) {
  const instanceId = useId().replace(/:/g, '');
  const titleId = `${instanceId}-title`;
  const descriptionId = `${instanceId}-description`;
  const gradientId = `${instanceId}-fill`;
  const hasCompleteSeries = dimensions.length >= 3
    && dimensions.every(({ assessable, score }) => assessable && score !== null);

  return (
    <div className="artwork-affect-radar">
      <svg
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>单件作品八维表达雷达图</title>
        <desc id={descriptionId}>
          八个维度均使用零到一百分的作品表达标注量尺。
        </desc>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4dbfb4" stopOpacity="0.48" />
            <stop offset="100%" stopColor="#1b3a6b" stopOpacity="0.24" />
          </linearGradient>
        </defs>
        <RadarGrid dimensions={dimensions} />
        {hasCompleteSeries && <RadarSeries dimensions={dimensions} gradientId={gradientId} />}
        <RadarLabels dimensions={dimensions} />
      </svg>
      {!hasCompleteSeries && (
        <span className="artwork-affect-radar__empty">维度数据不足，暂不绘制数据轮廓</span>
      )}
    </div>
  );
}
