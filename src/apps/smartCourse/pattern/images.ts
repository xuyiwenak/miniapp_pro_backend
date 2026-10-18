import sharp from 'sharp';
import { colorize } from './color';
import { cropPlacement } from './geometry';
import type { PatternState } from './contract';
import { LIMITS } from '../config';
import { SmartCourseError } from '../errors';
export type Image = { uri: string; width: number; height: number };
export function dataUri(buffer: Buffer, mime = 'image/png') {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}
export async function normalizePatternImage(buffer: Buffer) {
  try {
    const image = sharp(buffer, { limitInputPixels: LIMITS.imagePixels, failOn: 'error' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) throw new Error();
    return await image.rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .png().toBuffer({ resolveWithObject: true });
  } catch {
    throw new SmartCourseError(400, 'INVALID_IMAGE', '请上传静态 JPG、PNG 或 WebP 图片，暂不支持 HEIC');
  }
}
export async function coloredImage(buffer: Buffer, state: PatternState): Promise<Image> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  colorize(data, state);
  const png = await sharp(data, { raw: info }).png().toBuffer();
  return { uri: dataUri(png), width: info.width, height: info.height };
}
export async function cropCenter(image: Image, state: PatternState): Promise<Image> {
  const edge = 768; const p = cropPlacement(image.width, image.height, state.crop, edge);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${edge}" height="${edge}"><defs><clipPath id="crop"><circle cx="384" cy="384" r="384"/></clipPath></defs><g clip-path="url(#crop)"><g transform="translate(${384 + p.x},${384 + p.y}) rotate(${state.crop.rotation})"><image href="${image.uri}" x="${-p.width / 2}" y="${-p.height / 2}" width="${p.width}" height="${p.height}"/></g></g></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { uri: dataUri(png), width: edge, height: edge };
}
export async function trimImage(image: Image): Promise<Image> {
  const png = Buffer.from(image.uri.split(',')[1], 'base64');
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width; let top = info.height; let right = -1; let bottom = -1;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    const x = (i / 4) % info.width; const y = Math.floor(i / 4 / info.width);
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new SmartCourseError(400, 'EMPTY_MOTIF', '没有找到可见纹样，请降低去白底强度或重新取景');
  const region = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const trimmed = await sharp(png).extract(region).png().toBuffer();
  return { uri: dataUri(trimmed), width: region.width, height: region.height };
}
