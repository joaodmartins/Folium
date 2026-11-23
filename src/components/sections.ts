import type { Book, CategoryNode } from '../../tools/vite-plugin-folium/types';
import type { AssetResolver } from '../assets';
import { el } from '../dom';
import type { Library } from '../library';
import { renderBookCard } from './book-card';
import { renderCategoryCard } from './category-card';

/** "Categories" and "Books" card grids shared by the home and category views. */
export function renderCategoryGrid(library: Library, categories: CategoryNode[], assetUrl: AssetResolver, heading: string) {
  if (categories.length === 0) return null;
  return el(
    'section',
    { class: 'section', 'aria-label': heading },
    el('h2', { class: 'section__title' }, heading),
    el('ul', { class: 'cards' }, ...categories.map((c) => renderCategoryCard(library, c, assetUrl))),
  );
}

export function renderBookGrid(books: Book[], assetUrl: AssetResolver, heading: string) {
  if (books.length === 0) return null;
  return el(
    'section',
    { class: 'section', 'aria-label': heading },
    el('h2', { class: 'section__title' }, heading),
    el('ul', { class: 'cards' }, ...books.map((b) => renderBookCard(b, assetUrl))),
  );
}
