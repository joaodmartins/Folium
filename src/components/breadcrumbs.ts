import type { Book, CategoryNode } from '../../tools/vite-plugin-folium/types';
import { el } from '../dom';
import type { Library } from '../library';
import { categoryHash } from '../router';

export interface Crumb {
  label: string;
  /** Hash to link to; the current page has none. */
  href?: string;
}

/** Library › … › category (current page last). */
export function categoryCrumbs(library: Library, category: CategoryNode): Crumb[] {
  const trail = library.trailTo(category);
  return trail.map((node, i) => ({
    label: node.title,
    href: i === trail.length - 1 ? undefined : categoryHash(node),
  }));
}

/** Library › … › category › book (current page last). */
export function bookCrumbs(library: Library, book: Book): Crumb[] {
  const category = library.getCategory(book.categoryId) ?? library.root;
  const trail = library.trailTo(category).map((node) => ({ label: node.title, href: categoryHash(node) }));
  return [...trail, { label: book.title }];
}

export function renderBreadcrumbs(crumbs: Crumb[]): HTMLElement {
  const items = crumbs.map((crumb) => {
    const isCurrent = crumb.href === undefined;
    return el(
      'li',
      { class: 'breadcrumbs__item' },
      isCurrent
        ? el('span', { 'aria-current': 'page' }, crumb.label)
        : el('a', { href: crumb.href! }, crumb.label),
    );
  });
  return el('nav', { class: 'breadcrumbs', 'aria-label': 'Breadcrumb' }, el('ol', { class: 'breadcrumbs__list' }, ...items));
}
