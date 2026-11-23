import type { CategoryNode } from '../../tools/vite-plugin-folium/types';
import { categoryCrumbs, renderBreadcrumbs } from '../components/breadcrumbs';
import { renderBookGrid, renderCategoryGrid } from '../components/sections';
import { el, pluralize } from '../dom';
import type { Page, ViewContext } from './types';

/** Any category, at any depth: its sub-categories first, then its books. */
export function renderCategoryView({ library, assetUrl }: ViewContext, category: CategoryNode): Page {
  const books = library.booksOf(category);
  const isEmpty = category.categories.length === 0 && books.length === 0;

  const element = el(
    'main',
    { class: 'page', id: 'main' },
    renderBreadcrumbs(categoryCrumbs(library, category)),
    el(
      'header',
      { class: 'page__header' },
      el('h1', { class: 'page__title', tabindex: '-1' }, category.title),
      category.description ? el('p', { class: 'page__lead' }, category.description) : null,
      el('p', { class: 'page__meta' }, pluralize(library.countBooks(category), 'book')),
    ),
    isEmpty ? el('p', { class: 'empty', 'data-testid': 'empty-state' }, 'This category has no books yet.') : null,
    renderCategoryGrid(library, category.categories, assetUrl, 'Categories'),
    renderBookGrid(books, assetUrl, 'Books'),
  );

  return { title: `${category.title} · ${library.title}`, element };
}
