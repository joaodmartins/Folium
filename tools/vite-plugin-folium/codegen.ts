import type { LibraryManifest } from './types.ts';

/**
 * Generates the source of the virtual module. The manifest is plain JSON data;
 * each book additionally gets a `load()` that lazily imports its Markdown source
 * (`?raw`), so only the book being read is ever downloaded.
 */
export function generateModule(manifest: LibraryManifest, libraryDir: string): string {
  const posixLibrary = libraryDir.split('\\').join('/').replace(/\/$/, '');

  const books = manifest.books.map((book) => {
    const source = JSON.stringify(`${posixLibrary}/${book.path}?raw`);
    return `{ ...${JSON.stringify(book)}, load: () => import(${source}).then((m) => m.default) }`;
  });

  return [
    `export const manifest = {`,
    `  config: ${JSON.stringify(manifest.config)},`,
    `  root: ${JSON.stringify(manifest.root)},`,
    `  books: [`,
    ...books.map((b) => `    ${b},`),
    `  ],`,
    `};`,
    `export default manifest;`,
    ``,
  ].join('\n');
}
