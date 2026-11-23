import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, posix, relative } from 'node:path';
import { loadFolderConfig, loadGlobalConfig } from './config.ts';
import { extractFirstH1, parseFrontmatter, splitFrontmatter } from './frontmatter.ts';
import { naturalCompare, slugPath } from './slug.ts';
import type { Book, BookDefaults, CategoryNode, Issue, LibraryManifest } from './types.ts';

export interface ScanOptions {
  /** Absolute path of the `Library/` folder. */
  libraryDir: string;
  /** Absolute path of `folium.config.json` (the file is optional). */
  configFile: string;
  /** Project root, used only to print readable file paths in issues. */
  root: string;
}

export interface ScanResult {
  manifest: LibraryManifest;
  issues: Issue[];
  /** Absolute paths of the Markdown and config files that influenced the manifest. */
  files: string[];
}

const FOLDER_CONFIG_NAME = '_folder.json';

/** Items with an `order` come first (ascending); the rest follow in natural name order. */
function compareByOrderThenName(a: { order?: number; name: string }, b: { order?: number; name: string }): number {
  const ao = a.order ?? Number.POSITIVE_INFINITY;
  const bo = b.order ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao < bo ? -1 : 1;
  return naturalCompare(a.name, b.name);
}

/**
 * Resolves a path written in a config/frontmatter (relative to the folder `dir`) to a
 * library-relative POSIX path. Paths escaping the library are reported and dropped.
 */
function resolveLibraryPath(dir: string, value: string | undefined, file: string, issues: Issue[]): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.replace(/\\/g, '/');
  const resolved = posix.normalize(posix.join(dir, normalized));
  if (posix.isAbsolute(normalized) || resolved === '..' || resolved.startsWith('../')) {
    issues.push({ level: 'error', file, message: `Path "${value}" must stay inside the Library folder.` });
    return undefined;
  }
  return resolved;
}

/**
 * Scans the library and builds the manifest. Never throws for content problems:
 * they are returned in `issues`, and books/configs with errors are left out.
 */
export function scanLibrary(options: ScanOptions): ScanResult {
  const { libraryDir, configFile, root } = options;
  const issues: Issue[] = [];
  const files: string[] = [configFile];
  const display = (abs: string) => relative(root, abs).split('\\').join('/') || '.';

  const config = loadGlobalConfig(configFile, display(configFile), issues);

  const booksById = new Map<string, Book>();
  const idOwners = new Map<string, string>(); // book id -> library path, to detect collisions

  const rootNode: CategoryNode = { id: '', name: '', path: '', title: config.title, categories: [], bookIds: [] };

  if (!existsSync(libraryDir) || !statSync(libraryDir).isDirectory()) {
    issues.push({ level: 'error', file: display(libraryDir), message: 'Library folder not found.' });
    return { manifest: { config, root: rootNode, books: [] }, issues, files };
  }

  /** Reads one book. Returns undefined for drafts and for books with errors. */
  function readBook(absFile: string, dirRel: string, inherited: BookDefaults): Book | undefined {
    const fileName = basename(absFile);
    const relPath = posix.join(dirRel, fileName);
    const shown = display(absFile);
    files.push(absFile);

    const local: Issue[] = [];
    const { yaml, body } = splitFrontmatter(readFileSync(absFile, 'utf8'));
    const fm = parseFrontmatter(yaml, shown, local);
    const cover = resolveLibraryPath(dirRel, fm.cover, shown, local);
    issues.push(...local);
    if (local.some((i) => i.level === 'error')) return undefined;
    if (fm.draft === true) return undefined;

    const stem = fileName.replace(/\.md$/i, '');
    const id = slugPath(posix.join(dirRel, stem));
    const owner = idOwners.get(id);
    if (owner !== undefined) {
      issues.push({
        level: 'error',
        file: shown,
        message: `Book id "${id}" is already used by "${owner}". Rename one of the files.`,
      });
      return undefined;
    }
    idOwners.set(id, relPath);

    return {
      id,
      title: fm.title ?? extractFirstH1(body) ?? stem,
      path: relPath,
      category: dirRel,
      categoryId: slugPath(dirRel),
      meta: {
        author: fm.author ?? inherited.author,
        description: fm.description,
        cover,
        language: fm.language ?? inherited.language,
        showTableOfContents: fm.showTableOfContents ?? inherited.showTableOfContents,
        order: fm.order,
        chapterBreak: fm.chapterBreak ?? inherited.chapterBreak,
      },
    };
  }

  /** Walks one folder. Returns undefined when it (and its sub-folders) holds no visible book. */
  function readFolder(absDir: string, dirRel: string, inherited: BookDefaults): CategoryNode | undefined {
    const configPath = join(absDir, FOLDER_CONFIG_NAME);
    const folder = loadFolderConfig(configPath, display(configPath), issues);
    if (existsSync(configPath)) files.push(configPath);

    // Priority: global config → parent folders → this folder (the most specific wins).
    const defaults: BookDefaults = { ...inherited, ...folder.defaults };

    const categories: CategoryNode[] = [];
    const books: Book[] = [];

    const entries = readdirSync(absDir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
    for (const entry of entries) {
      const absChild = join(absDir, entry.name);
      if (entry.isDirectory()) {
        const child = readFolder(absChild, posix.join(dirRel, entry.name), defaults);
        if (child) categories.push(child);
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        const book = readBook(absChild, dirRel, defaults);
        if (book) books.push(book);
      }
    }

    if (categories.length === 0 && books.length === 0) return undefined;

    const sortKey = (b: Book) => ({ order: b.meta.order, name: basename(b.path) });
    books.sort((a, b) => compareByOrderThenName(sortKey(a), sortKey(b)));
    categories.sort(compareByOrderThenName);
    for (const book of books) booksById.set(book.id, book);

    const isRoot = dirRel === '';
    return {
      id: slugPath(dirRel),
      name: isRoot ? '' : basename(absDir),
      path: dirRel,
      title: folder.title ?? (isRoot ? config.title : basename(absDir)),
      description: folder.description,
      cover: resolveLibraryPath(dirRel, folder.cover, display(configPath), issues),
      order: folder.order,
      categories,
      bookIds: books.map((b) => b.id),
    };
  }

  const tree = readFolder(libraryDir, '', config.defaults) ?? rootNode;

  // Flat list in tree order: per folder, sub-categories first, then the folder's own books.
  const ordered: Book[] = [];
  const visit = (node: CategoryNode) => {
    node.categories.forEach(visit);
    for (const id of node.bookIds) ordered.push(booksById.get(id)!);
  };
  visit(tree);

  return { manifest: { config, root: tree, books: ordered }, issues, files };
}
