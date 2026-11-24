import { el } from '../dom';
import { currentTheme, setTheme } from '../state/theme';
import { renderThemeSwitcher } from './theme-switcher';

export interface SiteBarOptions {
  /** Library title, shown as a link home. Left out on the home page, whose hero already is the title. */
  brand?: { title: string; href: string };
}

/**
 * Slim bar on every page except the reader: a way home, the theme control (the same one the
 * reader has, so the theme can be chosen anywhere) and a "skip to content" link for keyboards.
 */
export function renderSiteBar({ brand }: SiteBarOptions = {}): HTMLElement {
  const skip = el('a', { class: 'skip-link', href: '#main' }, 'Skip to content');
  // The address bar is the router: a plain `#main` link would navigate to "not found".
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    const main = document.getElementById('main');
    main?.setAttribute('tabindex', '-1');
    main?.focus();
  });

  const themes = renderThemeSwitcher(currentTheme(), (theme) => {
    setTheme(theme);
    themes.update(theme);
  });

  return el(
    'header',
    { class: 'site-bar' },
    skip,
    brand ? el('a', { class: 'site-bar__brand', href: brand.href, 'data-testid': 'site-brand' }, brand.title) : el('span'),
    themes.root,
  );
}
