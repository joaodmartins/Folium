import type { Book, CategoryNode } from '../tools/vite-plugin-folium/types';
import type { Library } from './library';

/**
 * Hash routes (work on GitHub Pages without server rewrites):
 *   #/                         home
 *   #/category/<category id>   e.g. #/category/languages/russian/a1
 *   #/book/<book id>           the book's cover, e.g. #/book/languages/russian/a1/alphabet
 *   #/read/<book id>           the open book (reading)
 *   #/book/<book id>#<heading> a heading inside a book: opens it for reading at that heading
 *                              (a second "#": the first one is the router's; also valid on #/read/…)
 * Ids are the ones in the manifest (slugged folder/file paths).
 */
export type Route =
  | { name: 'home' }
  | { name: 'category'; id: string }
  | { name: 'book'; id: string; anchor?: string }
  | { name: 'read'; id: string; anchor?: string }
  | { name: 'not-found'; hash: string };

/** A route checked against the library: unknown ids become `not-found`. */
export type ResolvedRoute<B extends Book = Book> =
  | { name: 'home' }
  | { name: 'category'; category: CategoryNode }
  | { name: 'book'; book: B; anchor?: string }
  | { name: 'read'; book: B; anchor?: string }
  | { name: 'not-found'; hash: string };

/** Parses `location.hash` into a route. Purely syntactic: it does not look at the library. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const anchorAt = raw.indexOf('#');
  const rawAnchor = anchorAt === -1 ? '' : raw.slice(anchorAt + 1);
  const path = (anchorAt === -1 ? raw : raw.slice(0, anchorAt)).split('?')[0];
  if (/^\/*$/.test(path)) return { name: 'home' };

  const notFound: Route = { name: 'not-found', hash };
  if (!path.startsWith('/')) return notFound;

  let segments: string[];
  let anchor: string;
  try {
    segments = path.split('/').filter((s) => s !== '').map(decodeURIComponent);
    anchor = decodeURIComponent(rawAnchor);
  } catch {
    return notFound; // malformed %-escape
  }

  const [kind, ...rest] = segments;
  if (rest.length === 0 || rest.some((s) => s === '.' || s === '..')) return notFound;
  if (kind === 'category') return { name: 'category', id: rest.join('/') };
  if (kind === 'book' || kind === 'read') {
    const id = rest.join('/');
    return anchor === '' ? { name: kind, id } : { name: kind, id, anchor };
  }
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
    case 'read':
      return `#/${route.name}/${encodeId(route.id)}${route.anchor ? `#${encodeURIComponent(route.anchor)}` : ''}`;
    case 'not-found':
      return route.hash;
  }
}

export const categoryHash = (category: CategoryNode) =>
  category.id === '' ? hashFor({ name: 'home' }) : hashFor({ name: 'category', id: category.id });
/** The book's cover page. */
export const bookHash = (book: Book) => hashFor({ name: 'book', id: book.id });
/** The open book (reading), optionally at a heading. */
export const readHash = (book: Book, anchor?: string) => hashFor({ name: 'read', id: book.id, anchor });

export function resolveRoute<B extends Book>(route: Route, library: Library<B>): ResolvedRoute<B> {
  switch (route.name) {
    case 'home':
      return route;
    case 'category': {
      const category = route.id === '' ? undefined : library.getCategory(route.id);
      return category ? { name: 'category', category } : { name: 'not-found', hash: hashFor(route) };
    }
    case 'book':
    case 'read': {
      const book = library.getBook(route.id);
      if (!book) return { name: 'not-found', hash: hashFor(route) };
      return route.anchor ? { name: route.name, book, anchor: route.anchor } : { name: route.name, book };
    }
    case 'not-found':
      return route;
  }
}
