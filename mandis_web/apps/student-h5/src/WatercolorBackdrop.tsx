import type { CSSProperties, PropsWithChildren } from 'react';
import { watercolorBackground, watercolorBackgroundPortrait } from './assets';

export function WatercolorBackdrop({ children }: PropsWithChildren) {
  return (
    <div
      className="watercolor-backdrop"
      style={{
        '--watercolor-image': `url(${watercolorBackground})`,
        '--watercolor-image-portrait': `url(${watercolorBackgroundPortrait})`,
      } as CSSProperties}
    >
      {children}
    </div>
  );
}
