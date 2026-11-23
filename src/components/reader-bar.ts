import { el } from '../dom';
import type { Theme } from '../state/theme';
import { renderPageIndicator, type PageIndicator, type PageView } from './page-indicator';
import { renderThemeSwitcher, type ThemeSwitcher } from './theme-switcher';

export interface ReaderBar {
  root: HTMLElement;
  indicator: PageIndicator;
  themes: ThemeSwitcher;
  prevButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  /** Shows the pages on screen and enables/disables the previous/next buttons. */
  update(state: PageView): void;
}

export interface ReaderBarOptions {
  /** Where "back" goes (the book's category) and how it is called. */
  backHref: string;
  backLabel: string;
  theme: Theme;
  onTheme(theme: Theme): void;
  /** Called with a 0-based page when a page number is typed in the indicator. */
  onGoToPage(page: number): void;
  onPrev(): void;
  onNext(): void;
}

function arrowButton(kind: 'prev' | 'next', label: string, glyph: string): HTMLButtonElement {
  const button = el(
    'button',
    { type: 'button', class: `bar-button bar-button--${kind}`, 'data-testid': `${kind}-page`, 'aria-label': label, disabled: '' },
    el('span', { 'aria-hidden': 'true' }, glyph),
  );
  return button;
}

/** The only chrome while reading: back, previous / page indicator / next, and the theme. */
export function renderReaderBar(options: ReaderBarOptions): ReaderBar {
  const back = el(
    'a',
    { class: 'bar-link', href: options.backHref, 'data-testid': 'back-link' },
    el('span', { 'aria-hidden': 'true' }, '‹'),
    el('span', { class: 'bar-link__label' }, options.backLabel),
  );

  const prevButton = arrowButton('prev', 'Previous page', '‹');
  const nextButton = arrowButton('next', 'Next page', '›');
  prevButton.addEventListener('click', options.onPrev);
  nextButton.addEventListener('click', options.onNext);

  const indicator = renderPageIndicator(options.onGoToPage);
  const status = el('span', { class: 'sr-only', role: 'status' });
  const themes = renderThemeSwitcher(options.theme, options.onTheme);

  const root = el(
    'header',
    { class: 'reader-bar' },
    back,
    el('div', { class: 'pager-group' }, prevButton, indicator.root, nextButton, status),
    themes.root,
  );

  return {
    root,
    indicator,
    themes,
    prevButton,
    nextButton,
    update(state) {
      indicator.update(state);
      const last = Math.min(state.page + state.pagesPerView, state.pageCount);
      prevButton.disabled = state.page <= 0;
      nextButton.disabled = last >= state.pageCount;
      status.textContent =
        state.pageCount === 0
          ? ''
          : last === state.page + 1
            ? `Page ${last} of ${state.pageCount}`
            : `Pages ${state.page + 1} and ${last} of ${state.pageCount}`;
    },
  };
}
