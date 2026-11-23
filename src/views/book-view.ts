import type { Book } from '../../tools/vite-plugin-folium/types';
import { bookCrumbs, renderBreadcrumbs } from '../components/breadcrumbs';
import { renderBookCover } from '../components/book-cover';
import { el } from '../dom';
import { categoryHash, readHash } from '../router';
import type { Page, ViewContext } from './types';

const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The book's cover page: what you see when you pick a book. The cover is the main element, with
 * the title, author, description and category beside it, and one button that opens the book.
 */
export function renderBookView({ library, assetUrl }: ViewContext, book: Book): Page {
  const category = library.getCategory(book.categoryId) ?? library.root;
  const categoryLabel = category.title;

  const cover = renderBookCover(book, assetUrl(book.meta.cover));

  const start = el('a', { class: 'button button--large', href: readHash(book), 'data-testid': 'start-reading' }, 'Start reading');

  const info = el(
    'div',
    { class: 'cover-view__info' },
    el('a', { class: 'cover-view__category', href: categoryHash(category), 'data-testid': 'category-link' }, categoryLabel),
    el('h1', { class: 'page__title cover-view__title', tabindex: '-1' }, book.title),
    book.meta.author ? el('p', { class: 'cover-view__author' }, `by ${book.meta.author}`) : null,
    book.meta.description ? el('p', { class: 'page__lead cover-view__description' }, book.meta.description) : null,
    el('div', { class: 'cover-view__actions' }, start),
  );

  const stage = el('div', { class: 'cover-view__stage' }, el('div', { class: 'cover-view__book' }, cover), info);

  const element = el(
    'main',
    { class: 'page cover-view', id: 'main' },
    el(
      'div',
      { class: 'cover-view__nav' },
      el(
        'a',
        { class: 'bar-link', href: categoryHash(category), 'data-testid': 'back-link' },
        el('span', { 'aria-hidden': 'true' }, '‹'),
        el('span', {}, categoryLabel === '' ? 'Library' : categoryLabel),
      ),
      renderBreadcrumbs(bookCrumbs(library, book)),
    ),
    stage,
  );

  // Opening the book: the cover swings open, then the reader appears. The link works without it.
  let opening = false;
  start.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (opening) {
      event.preventDefault();
      return;
    }
    const board = cover.querySelector<HTMLElement>('.book-cover__board');
    if (!board || typeof board.animate !== 'function' || prefersReducedMotion()) return; // plain navigation
    event.preventDefault();
    opening = true;
    stage.classList.add('is-opening');
    const swing = board.animate(
      [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-168deg)' }],
      { duration: 620, easing: 'cubic-bezier(0.5, 0.05, 0.25, 1)', fill: 'forwards' },
    );
    info.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, fill: 'forwards' });
    const go = () => {
      window.location.hash = readHash(book);
    };
    swing.finished.then(go, go);
  });

  return { title: `${book.title} · ${library.title}`, element };
}
