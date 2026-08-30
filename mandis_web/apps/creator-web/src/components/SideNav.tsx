import { NavLink } from 'react-router-dom';
import type { Locale } from '../i18n/copy';
import { COPY } from '../i18n/copy';
import { BrandMark } from './BrandMark';

type SideNavProps = {
  locale: Locale;
  onSignOut: () => void;
};

const NAV_ITEMS = [
  { to: '/', icon: '◌', key: 'begin' },
  { to: '/reports', icon: '□', key: 'reports' },
  { to: '/profile', icon: '◒', key: 'profile' },
] as const;

export function SideNav({ locale, onSignOut }: SideNavProps) {
  return (
    <aside className="side-nav">
      <BrandMark locale={locale} />
      <nav className="side-nav__links" aria-label="Primary navigation">
        {NAV_ITEMS.map(({ to, icon, key }) => (
          <NavLink key={to} className="side-nav__link" to={to} end={to === '/'}>
            <span aria-hidden="true">{icon}</span>
            {COPY[locale][key]}
          </NavLink>
        ))}
      </nav>
      <div className="side-nav__account">
        <div className="side-nav__avatar" aria-hidden="true">
          小
        </div>
        <div>
          <strong>小原</strong>
          <span>Art keeper</span>
        </div>
      </div>
      <button className="side-nav__signout" type="button" onClick={onSignOut}>
        <span aria-hidden="true">↪</span>
        {COPY[locale].signOut}
      </button>
    </aside>
  );
}
