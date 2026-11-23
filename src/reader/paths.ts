/**
 * Path helpers for links and images inside a book. Paths in the manifest are
 * library-relative POSIX paths (e.g. "Languages/Russian/A1/Alphabet.md").
 */

/** `scheme:` (http, mailto, tel…) or protocol-relative `//host`. */
export const isExternal = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');

/** Root-absolute ("/x") paths are left to the browser as they are. */
export const isRootAbsolute = (href: string) => href.startsWith('/') && !href.startsWith('//');

export function folderOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/** Splits "a/b.md#part" into the path and the (decoded) anchor. */
export function splitHref(href: string): { path: string; anchor: string } {
  const i = href.indexOf('#');
  const path = (i === -1 ? href : href.slice(0, i)).split('?')[0];
  return { path, anchor: i === -1 ? '' : safeDecode(href.slice(i + 1)) };
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Resolves `relative` (as written in the Markdown) against the folder of the book.
 * Returns a library-relative path, or null when it would leave the library.
 *   ("Languages/A1", "images/x.png") → "Languages/A1/images/x.png"
 *   ("Languages/A1", "../covers/c.png") → "Languages/covers/c.png"
 */
export function resolveLibraryPath(baseDir: string, relative: string): string | null {
  const out = baseDir === '' ? [] : baseDir.split('/');
  for (const raw of relative.split('/')) {
    const segment = safeDecode(raw);
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (out.length === 0) return null; // would escape Library/
      out.pop();
    } else {
      out.push(segment);
    }
  }
  return out.length === 0 ? null : out.join('/');
}
