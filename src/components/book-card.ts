import type { Book } from '../../tools/vite-plugin-folium/types';
import type { AssetResolver } from '../assets';
import { el } from '../dom';
import { bookHash } from '../router';
import { renderCover } from './cover';

export function renderBookCard(book: Book, assetUrl: AssetResolver): HTMLElement {
  return el(
    'li',
    { class: 'cards__item' },
    el(
      'a',
      { class: 'card card--book', href: bookHash(book), 'data-testid': 'book-card' },
      renderCover(book.title, book.id, assetUrl(book.meta.cover)),
      el(
        'div',
        { class: 'card__body' },
        el('h3', { class: 'card__title' }, book.title),
        book.meta.author ? el('p', { class: 'card__meta' }, book.meta.author) : null,
        book.meta.description ? el('p', { class: 'card__text' }, book.meta.description) : null,
      ),
    ),
  );
}
