import { parse } from 'yaml';
import type { BookFrontmatter, Issue } from './types.ts';
import { isPlainObject, readFields, type FieldSpec } from './validate.ts';

export const BOOK_FIELDS: Record<string, FieldSpec> = {
  title: 'string',
  author: 'string',
  description: 'string',
  cover: 'string',
  language: 'string',
  showTableOfContents: 'boolean',
  order: 'number',
  chapterBreak: ['h1', 'h2', 'none'],
  draft: 'boolean',
};

export { splitFrontmatter, type SplitResult } from './split-frontmatter.ts';

/**
 * Parses and validates the frontmatter of a book.
 * Problems are pushed to `issues` (errors for invalid YAML or wrong value types,
 * warnings for unknown fields) and the offending fields are left out.
 */
export function parseFrontmatter(yamlText: string | null, file: string, issues: Issue[]): BookFrontmatter {
  if (yamlText === null || yamlText.trim() === '') return {};

  let data: unknown;
  try {
    data = parse(yamlText);
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0] : String(err);
    issues.push({ level: 'error', file, message: `Invalid YAML frontmatter: ${message}` });
    return {};
  }

  if (data === null || data === undefined) return {};
  if (!isPlainObject(data)) {
    issues.push({ level: 'error', file, message: 'Frontmatter must be a YAML mapping (key: value pairs).' });
    return {};
  }
  return readFields(data, BOOK_FIELDS, file, issues, 'warning') as BookFrontmatter;
}

/** Text of the first level-1 ATX heading (`# Title`), ignoring fenced code blocks. */
export function extractFirstH1(markdown: string): string | undefined {
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const h1 = /^ {0,3}#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (h1 && h1[1].trim() !== '') return h1[1].trim();
  }
  return undefined;
}
