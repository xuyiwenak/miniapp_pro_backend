import { readFileSync } from 'fs';
import { join } from 'path';
import { parse, type Font } from 'opentype.js';
import { sealText } from './contract';
import { SmartCourseError } from '../errors';
let font: Font | undefined;
function sealFont(): Font {
  if (!font) {
    const data = readFileSync(join(__dirname, 'fonts/LXGWWenKai-Regular.ttf'));
    font = parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  }
  return font;
}
export function sealSvg(name: string): string {
  const text = sealText(name);
  if (!text) throw new SmartCourseError(400, 'SEAL_NAME', '请输入 2～4 个汉字署名或艺名');
  const letters = Array.from(text);
  const paths = letters.map((letter, i) => {
    const glyph = sealFont().charToGlyph(letter);
    if (!glyph.index) throw new SmartCourseError(400, 'SEAL_GLYPH', `印章字体暂不支持“${letter}”，请换一个字`);
    const path = glyph.getPath(0, 0, 100); const box = path.getBoundingBox();
    const size = 36; const scale = size / Math.max(box.x2 - box.x1, box.y2 - box.y1);
    const x = (i < 2 ? 55 : 9) + (size - (box.x2 - box.x1) * scale) / 2;
    const y = (i % 2 ? 55 : 9) + (size - (box.y2 - box.y1) * scale) / 2;
    return `<path transform="translate(${x},${y}) scale(${scale}) translate(${-box.x1},${-box.y1})" d="${path.toPathData(3)}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect x="2" y="2" width="96" height="96" rx="3" fill="white" stroke="#b33429" stroke-width="4"/><g fill="#b33429">${paths.join('')}</g></svg>`;
}
