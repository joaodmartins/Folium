import { el } from '../dom';
import type { BookLayout } from '../reader/layout';

export interface BookFrame {
  /** The open book: paper, the window onto the pages, the layer where turning pages are drawn, the spine. */
  root: HTMLElement;
  /** The clipped window onto the text columns (what the paginator measures). */
  viewport: HTMLElement;
  /** Overlay for the page-turn animation (empty when nothing is turning). */
  flipLayer: HTMLElement;
  /** Sets the size of the book and of its pages (CSS variables on the root). */
  applyLayout(layout: BookLayout): void;
}

/**
 * The visual book. It knows nothing about pagination: it provides a window (`viewport`) of the
 * size given by the layout, with the content inside, and draws the paper around it.
 *
 *   .book                 sized by applyLayout; `data-pages` is 1 or 2
 *     .book__paper        the pages' paper, edges and shadow
 *     .book__clip         window onto the text columns (padding = page margins)
 *       <content>
 *     .book__flip         where a turning page is drawn
 *     .book__spine        shading along the spine (open book only)
 */
export function renderBookFrame(content: HTMLElement): BookFrame {
  content.classList.add('book__pages');

  const viewport = el('div', { class: 'book__clip' }, content);
  const flipLayer = el('div', { class: 'book__flip', 'aria-hidden': 'true' });
  const root = el(
    'div',
    { class: 'book', 'data-testid': 'book-sheet', 'data-pages': '1' },
    el('div', { class: 'book__paper', 'aria-hidden': 'true' }),
    viewport,
    flipLayer,
    el('div', { class: 'book__spine', 'aria-hidden': 'true' }),
  );

  return {
    root,
    viewport,
    flipLayer,
    applyLayout(layout) {
      const style = root.style;
      style.setProperty('--page-w', `${layout.pageWidth}px`);
      style.setProperty('--page-h', `${layout.pageHeight}px`);
      style.setProperty('--mx', `${layout.marginX}px`);
      style.setProperty('--my', `${layout.marginY}px`);
      style.setProperty('--gutter', `${layout.gutter}px`);
      style.width = `${layout.bookWidth}px`;
      style.height = `${layout.pageHeight}px`;
      root.dataset.pages = String(layout.pages);
    },
  };
}
