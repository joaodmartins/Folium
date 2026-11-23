import { renderBookGrid, renderCategoryGrid } from '../components/sections';
import { el } from '../dom';
import type { Page, ViewContext } from './types';

/** Home: the library title/tagline and its top-level categories (and any books at the root). */
export function renderLibraryView({ library, assetUrl }: ViewContext): Page {
  const { root } = library;
  const rootBooks = library.booksOf(root);
  const isEmpty = root.categories.length === 0 && rootBooks.length === 0;

  const element = el(
    'main',
    { class: 'page page--home', id: 'main' },
    el(
      'header',
      { class: 'hero' },
      el('h1', { class: 'hero__title', 'data-testid': 'logo', tabindex: '-1' }, library.title, el('span', { 'aria-hidden': 'true' }, '.')),
      library.tagline ? el('p', { class: 'hero__tagline' }, library.tagline) : null,
      !isEmpty ? el('p', { class: 'hero__count' }, `${library.books.length} ${library.books.length === 1 ? 'book' : 'books'}`) : null,
    ),
    isEmpty
      ? el(
          'p',
          { class: 'empty', 'data-testid': 'empty-state' },
          'Your library is empty. Add a Markdown file to the Library/ folder and it will show up here.',
        )
      : null,
    renderCategoryGrid(library, root.categories, assetUrl, 'Categories'),
    renderBookGrid(rootBooks, assetUrl, 'Books'),
  );

  return { title: library.title, element };
}
