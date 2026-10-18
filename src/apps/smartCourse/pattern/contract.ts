/** Versioned classroom contract. Safe to import in the browser (no server dependencies). */
export const PATTERN_VERSION = 'qinghua-plate-v1';
export const RENDER_VERSION = 'plate-1';
export const EXPORT_SIZE = 2048;
export const PREVIEW_SIZE = 640;
export const PALETTES = {
  light: { label: '淡青', rgb: [64, 117, 152] },
  classic: { label: '经典青花', rgb: [27, 58, 107] },
  deep: { label: '浓蓝', rgb: [15, 35, 77] },
} as const;
export const STEPS = ['我的纹样', '连续排列', '我的青花盘', '我的成品'] as const;
export const RULES = { repeat: '同向重复', mirror: '镜像交替', rotate: '旋转交替' } as const;
export const ORIENTATIONS = { outward: '朝外', inward: '朝内', tangent: '沿圆周' } as const;
export const COUNTS = [8, 12, 16] as const;
export type Crop = { x: number; y: number; zoom: number; rotation: number; fit: 'contain' | 'cover' };
export type Ring = { source: 'preset' | 'center' | 'upload'; assetId: string; presetId: string;
  rule: keyof typeof RULES; count: number; orientation: keyof typeof ORIENTATIONS };
export type PatternState = { version: typeof PATTERN_VERSION; centerAssetId: string; crop: Crop;
  removeWhite: boolean; whiteThreshold: number; palette: keyof typeof PALETTES;
  template: 'single' | 'double'; rings: [Ring, Ring]; seal: { enabled: boolean; name: string };
  step: number; statement: string };
export type PatternAssetView = { assetId: string; imageUrl: string; width: number; height: number };
export type PatternExportView = { revision: number; imageUrl: string; createdAt: string;
  artworkId: string; sourceAssetId: string };
export type CeramicView = { revision: number; status: 'submitting' | 'pending' | 'success' | 'failed' | 'unknown';
  model: string; createdAt: string; imageUrl?: string };
export type DesignView = { revision: number; state: PatternState; assets: PatternAssetView[];
  exports: PatternExportView[]; ceramicReady?: boolean; ceramics?: CeramicView[]; participantId?: string };
export type Preview = { plate: string; center: string; strip: string; seal: string };
export function newPatternState(): PatternState {
  const ring: Ring = { source: 'preset', assetId: '', presetId: 'leaf', rule: 'repeat',
    count: 12, orientation: 'outward' };
  return { version: PATTERN_VERSION, centerAssetId: '',
    crop: { x: 0, y: 0, zoom: 1, rotation: 0, fit: 'contain' },
    removeWhite: true, whiteThreshold: 230, palette: 'classic', template: 'single',
    rings: [{ ...ring }, { ...ring, presetId: 'petal' }], seal: { enabled: false, name: '' },
    step: 1, statement: '' };
}
/** Traditional column order: top-right, bottom-right, top-left, bottom-left. */
export function sealText(name: string): string {
  const count = Array.from(name).length;
  if (!/^[\p{Script=Han}]{2,4}$/u.test(name)) return '';
  if (count === 2) return `${name}之印`;
  return count === 3 ? `${name}印` : name;
}
