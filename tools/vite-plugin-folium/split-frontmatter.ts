// Kept free of dependencies (no YAML parser) so the browser can import it to strip the
// frontmatter from a book's source without bundling the build-time code.

// Opening `---` line, optional YAML, closing `---` line. Tolerates a BOM and CRLF line endings.
const FRONTMATTER_RE = /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export interface SplitResult {
  /** Raw YAML text, or null when the file has no frontmatter block. */
  yaml: string | null;
  /** Markdown after the frontmatter block (the whole text when there is none). */
  body: string;
}

export function splitFrontmatter(text: string): SplitResult {
  const match = FRONTMATTER_RE.exec(text);
  if (!match) return { yaml: null, body: text.replace(/^\uFEFF/, '') };
  return { yaml: match[1] ?? '', body: text.slice(match[0].length) };
}
