import type { Book } from '../../tools/vite-plugin-folium/types';
import { el } from '../dom';
import { hueFor } from './cover';

/**
 * The cover of a book, drawn like a physical one: the cover image when the book has one, otherwise
 * a printed cover made from the title and author. Decorative depth (spine, thickness, shadow) is CSS.
 */
export function renderBookCover(book: Book, imageUrl: string | undefined): HTMLElement {
  const printedFace = () =>
    el(
      'div',
      { class: 'book-cover__print', 'aria-hidden': 'true' },
      el('span', { class: 'book-cover__rule' }),
      el('span', { class: 'book-cover__title' }, book.title),
      el('span', { class: 'book-cover__rule' }),
      book.meta.author ? el('span', { class: 'book-cover__author' }, book.meta.author) : null,
    );

  const image = imageUrl ? el('img', { class: 'book-cover__image', src: imageUrl, alt: `Cover of ${book.title}` }) : undefined;
  const board = el('div', { class: 'book-cover__board' }, image ?? printedFace(), el('span', { class: 'book-cover__hinge', 'aria-hidden': 'true' }));

  const cover = el(
    'div',
    {
      class: `book-cover ${image ? 'book-cover--image' : 'book-cover--printed'}`,
      'data-title-length': titleLength(book.title),
      'data-testid': 'book-cover',
    },
    el('div', { class: 'book-cover__pages', 'aria-hidden': 'true' }),
    board,
  );
  cover.style.setProperty('--cover-hue', String(hueFor(book.id)));

  // A cover image that fails to load must not leave a broken picture: print the cover instead.
  image?.addEventListener(
    'error',
    () => {
      image.replaceWith(printedFace());
      cover.classList.replace('book-cover--image', 'book-cover--printed');
    },
    { once: true },
  );
  return cover;
}

/** Size class for the printed title, so a long one still fits the cover. */
function titleLength(title: string): 'short' | 'medium' | 'long' {
  const length = [...title].length;
  return length <= 28 ? 'short' : length <= 60 ? 'medium' : 'long';
}
