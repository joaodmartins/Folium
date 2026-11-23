import { el } from '../dom';
import type { PageState } from '../reader/paginator/types';

export interface BookSheet {
  /** The page "sheet": the page window plus the page controls. */
  root: HTMLElement;
  /** Clipped window of exactly one page. */
  viewport: HTMLElement;
  /** Shows the state in the page indicator and enables/disables the buttons. */
  update(state: PageState): void;
  prevButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
}

function navButton(kind: 'prev' | 'next'): HTMLButtonElement {
  const isPrev = kind === 'prev';
  return el(
    'button',
    {
      type: 'button',
      class: `book__nav book__nav--${kind}`,
      'data-testid': `${kind}-page`,
      'aria-label': isPrev ? 'Previous page' : 'Next page',
    },
    isPrev ? el('span', { 'aria-hidden': 'true' }, '‹') : null,
    el('span', { class: 'book__nav-label' }, isPrev ? 'Previous' : 'Next'),
    isPrev ? null : el('span', { 'aria-hidden': 'true' }, '›'),
  );
}

/** The book "paper": the page window (where the paginator lays out `pages`) and a footer with the controls. */
export function renderBookSheet(pages: HTMLElement): BookSheet {
  pages.classList.add('book__pages');

  const viewport = el('div', { class: 'book__clip' }, pages);
  const prevButton = navButton('prev');
  const nextButton = navButton('next');
  const indicator = el('span', { class: 'book__indicator', 'data-testid': 'page-indicator', 'aria-live': 'polite' });

  const root = el(
    'div',
    { class: 'book', 'data-testid': 'book-sheet' },
    el('div', { class: 'book__window' }, viewport),
    el('nav', { class: 'book__footer', 'aria-label': 'Book pages' }, prevButton, indicator, nextButton),
  );

  return {
    root,
    viewport,
    prevButton,
    nextButton,
    update({ page, pageCount }) {
      indicator.textContent = `${page + 1} / ${pageCount}`;
      indicator.setAttribute('aria-label', `Page ${page + 1} of ${pageCount}`);
      prevButton.disabled = page <= 0;
      nextButton.disabled = page >= pageCount - 1;
    },
  };
}
