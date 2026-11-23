import type { Book } from '../../tools/vite-plugin-folium/types';
import { bookCrumbs, renderBreadcrumbs } from '../components/breadcrumbs';
import { renderCover } from '../components/cover';
import { el } from '../dom';
import { categoryHash } from '../router';
import type { Page, ViewContext } from './types';

/** Book page. The Markdown reader arrives in a later phase: the content area is a placeholder. */
export function renderBookView({ library, assetUrl }: ViewContext, book: Book): Page {
  const category = library.getCategory(book.categoryId) ?? library.root;

  const details: [string, Node | string][] = [];
  if (book.meta.author) details.push(['Author', book.meta.author]);
  details.push(['Category', el('a', { href: categoryHash(category) }, category.title)]);
  details.push(['Language', book.meta.language]);

  const element = el(
    'main',
    { class: 'page', id: 'main' },
    renderBreadcrumbs(bookCrumbs(library, book)),
    el(
      'header',
      { class: 'book-header' },
      renderCover(book.title, book.id, assetUrl(book.meta.cover)),
      el(
        'div',
        { class: 'book-header__text' },
        el('h1', { class: 'page__title', tabindex: '-1' }, book.title),
        book.meta.description ? el('p', { class: 'page__lead' }, book.meta.description) : null,
        el(
          'dl',
          { class: 'details' },
          ...details.flatMap(([term, value]) => [el('dt', {}, term), el('dd', {}, value)]),
        ),
      ),
    ),
    el(
      'section',
      { class: 'placeholder', 'data-testid': 'book-content', 'aria-label': 'Book content' },
      el('p', {}, 'The book content will appear here once the reader is available.'),
      el('p', { class: 'placeholder__path' }, book.path),
    ),
  );

  return { title: `${book.title} · ${library.title}`, element };
}
