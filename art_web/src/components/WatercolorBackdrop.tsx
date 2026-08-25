import type { CSSProperties, PropsWithChildren } from 'react';
import { watercolorBackground } from '../assets';

export function WatercolorBackdrop({ children }: PropsWithChildren) {
  return (
    <div
      className="watercolor-backdrop"
      style={{ '--watercolor-image': `url(${watercolorBackground})` } as CSSProperties}
    >
      {children}
    </div>
  );
}
