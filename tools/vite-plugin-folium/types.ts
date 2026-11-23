/**
 * Shared types for the Folium library manifest.
 * Pure type declarations: safe to import from both Node (plugin) and browser (app) code.
 */

export type ChapterBreak = 'h1' | 'h2' | 'none';
export type ThemeName = 'light' | 'dark' | 'sepia';

/** Book settings that can be set globally or per folder, and inherited by books. */
export interface BookDefaults {
  author?: string;
  language: string;
  showTableOfContents: boolean;
  chapterBreak: ChapterBreak;
}

/** `defaults` block of a `_folder.json`: any subset of the book defaults. */
export type FolderDefaults = Partial<BookDefaults>;

/** Resolved `folium.config.json`. */
export interface FoliumConfig {
  title: string;
  tagline?: string;
  defaultTheme: ThemeName;
  defaults: BookDefaults;
}

/** Parsed `_folder.json`. All fields are optional. */
export interface FolderConfig {
  title?: string;
  description?: string;
  /** Library-relative path of the category cover image. */
  cover?: string;
  order?: number;
  defaults: FolderDefaults;
}

/** Frontmatter fields of a book, after validation. All optional. */
export interface BookFrontmatter {
  title?: string;
  author?: string;
  description?: string;
  cover?: string;
  language?: string;
  showTableOfContents?: boolean;
  order?: number;
  chapterBreak?: ChapterBreak;
  draft?: boolean;
}

/** Final book metadata after applying global config → folder configs → frontmatter. */
export interface BookMeta {
  author?: string;
  description?: string;
  /** Library-relative path of the cover image (e.g. "Languages/Russian/A1/cover.jpg"). */
  cover?: string;
  language: string;
  showTableOfContents: boolean;
  order?: number;
  chapterBreak: ChapterBreak;
}

export interface Book {
  /** Stable URL-safe id derived from the path, e.g. "languages/russian/a1/alphabet". */
  id: string;
  title: string;
  /** Library-relative POSIX path of the Markdown file, e.g. "Languages/Russian/A1/Alphabet.md". */
  path: string;
  /** Library-relative folder path ("" for books at the root), e.g. "Languages/Russian/A1". */
  category: string;
  /** Id of the category node this book belongs to (see {@link CategoryNode.id}). */
  categoryId: string;
  meta: BookMeta;
}

/** A book as exposed by the virtual module: includes a lazy loader for its Markdown source. */
export interface LoadableBook extends Book {
  /** Lazily loads the raw Markdown file (including its frontmatter). */
  load: () => Promise<string>;
}

export interface CategoryNode {
  /** Slugged folder path ("" for the root). */
  id: string;
  /** Folder name on disk ("" for the root). */
  name: string;
  /** Library-relative folder path ("" for the root). */
  path: string;
  /** Display title: `_folder.json` title, else the folder name (root: the site title). */
  title: string;
  description?: string;
  cover?: string;
  order?: number;
  /** Sub-categories, sorted. Categories without any visible book are not included. */
  categories: CategoryNode[];
  /** Ids of the books directly inside this folder, sorted. */
  bookIds: string[];
}

export interface LibraryManifest<B extends Book = Book> {
  config: FoliumConfig;
  /** Root of the category tree (the `Library/` folder itself). */
  root: CategoryNode;
  /** Every visible (non-draft) book, in tree order: per folder, sub-categories first, then its books. */
  books: B[];
}

export type IssueLevel = 'error' | 'warning';

export interface Issue {
  level: IssueLevel;
  /** File the issue refers to, relative to the project root. */
  file: string;
  message: string;
}
