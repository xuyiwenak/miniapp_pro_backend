import type { Crop, Ring } from './contract';
export const PLATE = { size: 1000, center: 500, radius: 470, centerRadius: 0.34,
  padding: 0.012, gap: 0.018, stampOffset: 0.32, stampSize: 0.10 } as const;
export const RING_BOUNDS = { single: [[0.60, 0.88]], double: [[0.60, 0.72], [0.77, 0.88]] } as const;
export function cropPlacement(width: number, height: number, crop: Crop, edge: number) {
  const rotated = crop.rotation % 180 !== 0;
  const w = rotated ? height : width; const h = rotated ? width : height;
  const dimension = crop.fit === 'contain' ? Math.max(w, h) : Math.min(w, h);
  const scale = edge / dimension * crop.zoom;
  return { width: width * scale, height: height * scale, x: crop.x * edge, y: crop.y * edge };
}
export function orbitItems(bounds: readonly number[], ring: Ring, width: number, height: number) {
  const [a, b] = bounds; const r = (a + b) / 2;
  const q = Math.min((b - a) / 2 - PLATE.padding, r * Math.sin(Math.PI / ring.count) - PLATE.gap / 2);
  const scale = 2 * q * PLATE.radius / Math.hypot(width, height);
  return Array.from({ length: ring.count }, (_, index) => {
    const angle = -Math.PI / 2 + 2 * Math.PI * index / ring.count;
    const offset = { outward: 90, inward: -90, tangent: 180 }[ring.orientation];
    const turn = ring.rule === 'rotate' && index % 2 ? 180 : 0;
    return { x: PLATE.center + r * PLATE.radius * Math.cos(angle),
      y: PLATE.center + r * PLATE.radius * Math.sin(angle), rotation: angle * 180 / Math.PI + offset + turn,
      flip: ring.rule === 'mirror' && index % 2 ? -1 : 1, width: width * scale, height: height * scale };
  });
}
