import type { Book } from '../../tools/vite-plugin-folium/types';
import { el } from '../dom';
import { hueFor } from './cover';

/**
 * The cover of a book, drawn like a physical one: the cover image when the book has one, otherwise
 * a printed cover made from the title and author. Decorative depth (spine, thickness, shadow) is CSS.
 */
export function renderBookCover(book: Book, imageUrl: string | undefined): HTMLElement {
  const face = imageUrl
    ? el('img', { class: 'book-cover__image', src: imageUrl, alt: `Cover of ${book.title}` })
    : el(
        'div',
        { class: 'book-cover__print', 'aria-hidden': 'true' },
        el('span', { class: 'book-cover__rule' }),
        el('span', { class: 'book-cover__title' }, book.title),
        el('span', { class: 'book-cover__rule' }),
        book.meta.author ? el('span', { class: 'book-cover__author' }, book.meta.author) : null,
      );

  const cover = el(
    'div',
    { class: `book-cover ${imageUrl ? 'book-cover--image' : 'book-cover--printed'}`, 'data-testid': 'book-cover' },
    el('div', { class: 'book-cover__pages', 'aria-hidden': 'true' }),
    el('div', { class: 'book-cover__board' }, face, el('span', { class: 'book-cover__hinge', 'aria-hidden': 'true' })),
  );
  cover.style.setProperty('--cover-hue', String(hueFor(book.id)));
  return cover;
}
