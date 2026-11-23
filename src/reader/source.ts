import type { Book } from '../../tools/vite-plugin-folium/types';

/** Loads the raw Markdown of a book. */
export type SourceLoader = (book: Book) => Promise<string>;

/**
 * Wraps a loader with a cache: opening the same book twice (or twice at once) loads it
 * once. Failed loads are not cached, so "Try again" really retries.
 */
export function createSourceLoader(load: SourceLoader): SourceLoader {
  const cache = new Map<string, Promise<string>>();
  return (book) => {
    let promise = cache.get(book.id);
    if (!promise) {
      promise = load(book);
      cache.set(book.id, promise);
      promise.catch(() => {
        if (cache.get(book.id) === promise) cache.delete(book.id);
      });
    }
    return promise;
  };
}

/** The manifest gives each book a `load()` that lazily imports its Markdown file. */
export const loadFromManifest: SourceLoader = (book) => {
  const load = (book as Partial<{ load: () => Promise<string> }>).load;
  if (typeof load !== 'function') return Promise.reject(new Error(`Book "${book.id}" has no content loader.`));
  return load();
};
