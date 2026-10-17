import type { CSSProperties, PropsWithChildren } from 'react';
import landscape from './assets/background-landscape.webp';
import portrait from './assets/background.webp';
export const watercolorBackground = landscape;
export const watercolorBackgroundPortrait = portrait;

export function WatercolorBackdrop({ children }: PropsWithChildren) {
  return <div className="watercolor-backdrop" style={{
    '--watercolor-image': `url(${landscape})`, '--watercolor-image-portrait': `url(${portrait})`,
  } as CSSProperties}>{children}</div>;
}
