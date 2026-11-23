import type { CategoryNode } from '../../tools/vite-plugin-folium/types';
import type { AssetResolver } from '../assets';
import { el, pluralize } from '../dom';
import type { Library } from '../library';
import { categoryHash } from '../router';
import { renderCover } from './cover';

export function renderCategoryCard(library: Library, category: CategoryNode, assetUrl: AssetResolver): HTMLElement {
  const parts = [pluralize(library.countBooks(category), 'book')];
  if (category.categories.length > 0) {
    parts.push(pluralize(category.categories.length, 'subcategory', 'subcategories'));
  }

  return el(
    'li',
    { class: 'cards__item' },
    el(
      'a',
      { class: 'card card--category', href: categoryHash(category), 'data-testid': 'category-card' },
      renderCover(category.title, category.id, assetUrl(category.cover)),
      el(
        'div',
        { class: 'card__body' },
        el('h3', { class: 'card__title' }, category.title),
        category.description ? el('p', { class: 'card__text' }, category.description) : null,
        el('p', { class: 'card__meta' }, parts.join(' · ')),
      ),
    ),
  );
}
