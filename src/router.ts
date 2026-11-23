import type { Book, CategoryNode } from '../tools/vite-plugin-folium/types';
import type { Library } from './library';

/**
 * Hash routes (work on GitHub Pages without server rewrites):
 *   #/                         home
 *   #/category/<category id>   e.g. #/category/languages/russian/a1
 *   #/book/<book id>           e.g. #/book/languages/russian/a1/alphabet
 * Ids are the ones in the manifest (slugged folder/file paths).
 */
export type Route =
  | { name: 'home' }
  | { name: 'category'; id: string }
  | { name: 'book'; id: string }
  | { name: 'not-found'; hash: string };

/** A route checked against the library: unknown ids become `not-found`. */
export type ResolvedRoute<B extends Book = Book> =
  | { name: 'home' }
  | { name: 'category'; category: CategoryNode }
  | { name: 'book'; book: B }
  | { name: 'not-found'; hash: string };

/** Parses `location.hash` into a route. Purely syntactic: it does not look at the library. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const path = raw.split('?')[0];
  if (/^\/*$/.test(path)) return { name: 'home' };

  const notFound: Route = { name: 'not-found', hash };
  if (!path.startsWith('/')) return notFound;

  let segments: string[];
  try {
    segments = path.split('/').filter((s) => s !== '').map(decodeURIComponent);
  } catch {
    return notFound; // malformed %-escape
  }

  const [kind, ...rest] = segments;
  if (rest.length === 0 || rest.some((s) => s === '.' || s === '..')) return notFound;
  if (kind === 'category') return { name: 'category', id: rest.join('/') };
  if (kind === 'book') return { name: 'book', id: rest.join('/') };
  return notFound;
}

const encodeId = (id: string) => id.split('/').map(encodeURIComponent).join('/');

/** Inverse of {@link parseHash}: the hash (with `#`) to use in a link. */
export function hashFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'category':
      return `#/category/${encodeId(route.id)}`;
    case 'book':
      return `#/book/${encodeId(route.id)}`;
    case 'not-found':
      return route.hash;
  }
}

export const categoryHash = (category: CategoryNode) =>
  category.id === '' ? hashFor({ name: 'home' }) : hashFor({ name: 'category', id: category.id });
export const bookHash = (book: Book) => hashFor({ name: 'book', id: book.id });

export function resolveRoute<B extends Book>(route: Route, library: Library<B>): ResolvedRoute<B> {
  switch (route.name) {
    case 'home':
      return route;
    case 'category': {
      const category = route.id === '' ? undefined : library.getCategory(route.id);
      return category ? { name: 'category', category } : { name: 'not-found', hash: hashFor(route) };
    }
    case 'book': {
      const book = library.getBook(route.id);
      return book ? { name: 'book', book } : { name: 'not-found', hash: hashFor(route) };
    }
    case 'not-found':
      return route;
  }
}
