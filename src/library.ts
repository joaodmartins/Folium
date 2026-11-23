import type { Book, CategoryNode, LibraryManifest } from '../tools/vite-plugin-folium/types';

/** Read-only lookups over the manifest. The manifest stays the single source of truth. */
export interface Library<B extends Book = Book> {
  title: string;
  tagline?: string;
  root: CategoryNode;
  books: B[];
  /** Category by manifest id (e.g. "languages/russian"). The root ("") is not addressable. */
  getCategory(id: string): CategoryNode | undefined;
  getBook(id: string): B | undefined;
  /** Books directly inside the category, in manifest order. */
  booksOf(category: CategoryNode): B[];
  /** Categories from the root down to (and including) the given category. */
  trailTo(category: CategoryNode): CategoryNode[];
  /** Books in the category and all its sub-categories. */
  countBooks(category: CategoryNode): number;
}

export function createLibrary<B extends Book>(manifest: LibraryManifest<B>): Library<B> {
  const categories = new Map<string, CategoryNode>();
  const parents = new Map<CategoryNode, CategoryNode>();
  const booksById = new Map(manifest.books.map((b) => [b.id, b]));
  const counts = new Map<CategoryNode, number>();

  const index = (node: CategoryNode) => {
    for (const child of node.categories) {
      categories.set(child.id, child);
      parents.set(child, node);
      index(child);
    }
  };
  index(manifest.root);

  const countBooks = (node: CategoryNode): number => {
    let total = counts.get(node);
    if (total === undefined) {
      total = node.bookIds.length + node.categories.reduce((sum, c) => sum + countBooks(c), 0);
      counts.set(node, total);
    }
    return total;
  };

  return {
    title: manifest.config.title,
    tagline: manifest.config.tagline,
    root: manifest.root,
    books: manifest.books,
    getCategory: (id) => categories.get(id),
    getBook: (id) => booksById.get(id),
    booksOf: (category) => category.bookIds.map((id) => booksById.get(id)).filter((b): b is B => b !== undefined),
    trailTo(category) {
      const trail: CategoryNode[] = [];
      for (let node: CategoryNode | undefined = category; node; node = parents.get(node)) trail.unshift(node);
      return trail;
    },
    countBooks,
  };
}
