import type { CategoryNode } from '../../tools/vite-plugin-folium/types';
import { el } from '../dom';
import type { Library } from '../library';
import { categoryHash, hashFor, parseHash } from '../router';
import type { Page, ViewContext } from './types';

const LEADS = {
  book: 'This book does not exist in the library. It may have been renamed, moved or removed.',
  category: 'This category does not exist in the library. It may have been renamed, moved or removed.',
  other: 'There is nothing at this address.',
};

/** The closest category that still exists above a missing book or category id (`a/b/c` → `a/b` → `a`). */
function nearestCategory(library: Library, id: string, isBook: boolean): CategoryNode | undefined {
  const segments = id.split('/');
  if (isBook) segments.pop();
  while (segments.length > 0) {
    const found = library.getCategory(segments.join('/'));
    if (found) return found;
    segments.pop();
  }
  return undefined;
}

/** Unknown route: says what was not found and offers a way back (home, plus the nearest category that exists). */
export function renderNotFoundView({ library }: ViewContext, hash: string): Page {
  const route = parseHash(hash);
  const kind = route.name === 'book' || route.name === 'read' ? 'book' : route.name === 'category' ? 'category' : 'other';
  const nearest = route.name === 'book' || route.name === 'read' || route.name === 'category' ? nearestCategory(library, route.id, kind === 'book') : undefined;

  const element = el(
    'main',
    { class: 'page page--centered', id: 'main' },
    el('h1', { class: 'page__title', tabindex: '-1' }, 'Page not found'),
    el('p', { class: 'page__lead' }, LEADS[kind]),
    el('p', { class: 'not-found__address' }, el('code', { 'data-testid': 'missing-route' }, hash || '(empty)')),
    el(
      'div',
      { class: 'not-found__actions' },
      el('a', { class: 'button', href: hashFor({ name: 'home' }), 'data-testid': 'not-found-home' }, `Back to ${library.title}`),
      nearest ? el('a', { class: 'button button--quiet', href: categoryHash(nearest) }, `Browse ${nearest.title}`) : null,
    ),
  );
  return { title: `Page not found · ${library.title}`, element };
}
