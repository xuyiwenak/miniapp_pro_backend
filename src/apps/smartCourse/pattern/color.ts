import { PALETTES, type PatternState } from './contract';
const MAX_CHANNEL = 255;
/** Alpha is preserved unless the student explicitly selects white-paper removal. */
export function colorize(pixels: Uint8Array, state: Pick<PatternState, 'palette' | 'removeWhite' | 'whiteThreshold'>) {
  const ink = PALETTES[state.palette].rgb;
  for (let i = 0; i < pixels.length; i += 4) {
    const luminance = (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / MAX_CHANNEL;
    const lightestInk = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (state.removeWhite) {
      const alpha = Math.min(1, Math.max(0, (state.whiteThreshold - lightestInk) / 28));
      pixels[i + 3] = Math.round(pixels[i + 3] * alpha);
    }
    for (let channel = 0; channel < 3; channel++) {
      pixels[i + channel] = Math.round(ink[channel] + (MAX_CHANNEL - ink[channel]) * luminance);
    }
  }
  return pixels;
}
