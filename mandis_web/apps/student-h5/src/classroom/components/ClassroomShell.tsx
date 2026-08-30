import type { ReactNode } from 'react';
import type { Locale } from '@mandis/common/classroom-types';
import { BrandMark } from '../../BrandMark';
import { WatercolorBackdrop } from '../../WatercolorBackdrop';

type Props = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  children: ReactNode;
};

export function ClassroomShell({ locale, onLocaleChange, children }: Props) {
  const nextLocale: Locale = locale === 'zh-CN' ? 'en' : 'zh-CN';
  return (
    <WatercolorBackdrop>
      <div className="classroom-h5">
        <header className="classroom-h5__header">
          <BrandMark locale={locale} />
          <button className="classroom-locale" type="button" onClick={() => onLocaleChange(nextLocale)}>
            <span lang="zh-CN">中</span>
            <i aria-hidden="true" />
            <span lang="en">EN</span>
          </button>
        </header>
        {children}
      </div>
    </WatercolorBackdrop>
  );
}
