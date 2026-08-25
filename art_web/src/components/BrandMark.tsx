import type { Locale } from '../i18n/copy';
import { COPY } from '../i18n/copy';

type BrandMarkProps = {
  locale: Locale;
};

export function BrandMark({ locale }: BrandMarkProps) {
  return (
    <a className="brand-mark" href="/art/" aria-label={COPY[locale].brand}>
      <span className="brand-mark__word">{COPY[locale].brand}</span>
      <span className="brand-mark__flower" aria-hidden="true">
        ✦
      </span>
    </a>
  );
}
