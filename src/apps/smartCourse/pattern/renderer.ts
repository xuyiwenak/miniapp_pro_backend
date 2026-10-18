import sharp from 'sharp';
import { PALETTES, PREVIEW_SIZE, type PatternState, type Ring } from './contract';
import { PLATE, RING_BOUNDS, orbitItems } from './geometry';
import { presetSvg } from './presets';
import { coloredImage, cropCenter, dataUri, trimImage, type Image } from './images';
import { sealSvg } from './seal';
type Assets = Map<string, Buffer>;
const EMPTY_IMAGE: Image = { uri: '', width: 100, height: 100 };
function imageTag(image: Image, x: number, y: number, width: number, height: number) {
  return `<image href="${image.uri}" x="${x}" y="${y}" width="${width}" height="${height}"/>`;
}
function wrapSvg(body: string, width = 1000, height = width) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}
async function ringImage(ring: Ring, state: PatternState, assets: Assets, center: Image): Promise<Image> {
  if (ring.source === 'center') return center.uri ? trimImage(center) : EMPTY_IMAGE;
  if (ring.source === 'upload') {
    const buffer = assets.get(ring.assetId);
    return buffer ? trimImage(await coloredImage(buffer, state)) : EMPTY_IMAGE;
  }
  const color = `rgb(${PALETTES[state.palette].rgb.join(',')})`;
  const png = await sharp(Buffer.from(presetSvg(ring.presetId, color))).resize(256, 256).png().toBuffer();
  return trimImage({ uri: dataUri(png), width: 256, height: 256 });
}
/** Periodic analytic wave is seamless in angle; no user bitmap is stretched to fake continuity. */
function waveBand(bounds: readonly number[], count: number, state: PatternState) {
  const [a, b] = bounds; const samples = count * 48; const color = `rgb(${PALETTES[state.palette].rgb.join(',')})`;
  return [-0.12, 0.12].map(offset => {
    const points = Array.from({ length: samples + 1 }, (_, i) => {
      const angle = i / samples * Math.PI * 2 - Math.PI / 2;
      const radial = (a + b) / 2 + (b - a) * (offset + 0.20 * Math.sin(i / samples * Math.PI * 2 * count));
      return `${PLATE.center + radial * PLATE.radius * Math.cos(angle)},${PLATE.center + radial * PLATE.radius * Math.sin(angle)}`;
    });
    return `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
  }).join('');
}
function ringSvg(ring: Ring, bounds: readonly number[], image: Image, state: PatternState) {
  if (ring.source === 'preset' && ring.presetId === 'wave') return waveBand(bounds, ring.count, state);
  if (!image.uri) return '';
  return orbitItems(bounds, ring, image.width, image.height).map(p =>
    `<g transform="translate(${p.x},${p.y}) rotate(${p.rotation}) scale(${p.flip},1)">${imageTag(image, -p.width / 2, -p.height / 2, p.width, p.height)}</g>`).join('');
}
function stripSvg(ring: Ring, image: Image, state: PatternState) {
  if (!image.uri) return wrapSvg('', 600, 100);
  if (ring.source === 'preset' && ring.presetId === 'wave') return waveStrip(ring.count, state);
  const unitEdge = Math.min(56, 600 / ring.count * 0.78);
  const width = unitEdge * image.width / Math.max(image.width, image.height);
  const height = unitEdge * image.height / Math.max(image.width, image.height);
  return wrapSvg(Array.from({ length: ring.count }, (_, i) => {
    const flip = ring.rule === 'mirror' && i % 2 ? -1 : 1;
    const rotation = ring.rule === 'rotate' && i % 2 ? 180 : 0;
    return `<g transform="translate(${(i + 0.5) * 600 / ring.count},50) rotate(${rotation}) scale(${flip},1)">${imageTag(image, -width / 2, -height / 2, width, height)}</g>`;
  }).join(''), 600, 100);
}
async function prepare(state: PatternState, assets: Assets) {
  const source = assets.get(state.centerAssetId);
  const center = source ? await cropCenter(await coloredImage(source, state), state) : EMPTY_IMAGE;
  if (center.uri) await trimImage(center); // Reject invisible crops instead of saving a blank design.
  const activeRings = state.rings.slice(0, state.template === 'double' ? 2 : 1);
  const rings = await Promise.all(activeRings.map(ring => ringImage(ring, state, assets, center)));
  const seal = state.seal.enabled ? sealSvg(state.seal.name) : '';
  return { center, rings, seal };
}
export async function renderPattern(state: PatternState, assets: Assets, size = PREVIEW_SIZE, ringIndex = 0) {
  const { center, rings, seal } = await prepare(state, assets);
  const r = PLATE.radius * PLATE.centerRadius;
  const centerMarkup = center.uri ? imageTag(center, PLATE.center - r, PLATE.center - r, r * 2, r * 2) : '';
  const ringMarkup = RING_BOUNDS[state.template].map((bounds, i) => ringSvg(state.rings[i], bounds, rings[i], state));
  const sealSize = PLATE.radius * PLATE.stampSize;
  const sealPosition = PLATE.center + PLATE.radius * PLATE.stampOffset - sealSize / 2;
  const sealMarkup = seal ? imageTag({ uri: dataUri(Buffer.from(seal), 'image/svg+xml'), width: 100, height: 100 },
    sealPosition, sealPosition, sealSize, sealSize) : '';
  const svg = wrapSvg(`<circle cx="500" cy="500" r="470" fill="white" stroke="#dddcd6" stroke-width="2"/>${centerMarkup}${ringMarkup.join('')}${sealMarkup}`);
  const plate = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  const strip = await sharp(Buffer.from(stripSvg(state.rings[ringIndex], rings[ringIndex], state))).png().toBuffer();
  return { png: plate, preview: { plate: dataUri(plate), center: center.uri, strip: dataUri(strip),
    seal: seal ? dataUri(Buffer.from(seal), 'image/svg+xml') : '' } };
}

function waveStrip(count: number, state: PatternState) {
  const color = `rgb(${PALETTES[state.palette].rgb.join(',')})`;
  const samples = count * 48;
  const paths = [-8, 8].map(offset => {
    const points = Array.from({ length: samples + 1 }, (_, i) => {
      const x = i / samples * 600; const y = 50 + offset + 14 * Math.sin(i / samples * 2 * Math.PI * count);
      return `${x},${y}`;
    });
    return `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`;
  });
  return wrapSvg(paths.join(''), 600, 100);
}
