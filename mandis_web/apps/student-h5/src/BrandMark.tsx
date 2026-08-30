import type { Locale } from '@mandis/common/classroom-types';

type BrandMarkProps = {
  locale: Locale;
};

export function BrandMark({ locale }: BrandMarkProps) {
  const brand = locale === 'zh-CN' ? '原色有感' : 'Original Sense';
  return (
    <a className="brand-mark" href="/classroom/" aria-label={brand}>
      <span className="brand-mark__word">{brand}</span>
      <span className="brand-mark__flower" aria-hidden="true">
        ✦
      </span>
    </a>
  );
}
