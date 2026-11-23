import MarkdownIt from 'markdown-it';

export type Markdown = InstanceType<typeof MarkdownIt>;

/** A markdown-it plugin (e.g. KaTeX or syntax highlighting in later phases). */
export type MarkdownPlugin = (md: Markdown) => void;

/**
 * Creates the Markdown renderer. Extensions are added by passing plugins, so later phases
 * can plug in math, highlighting, etc. without touching this file.
 *
 * - `html: true` lets authors use harmless inline HTML (`<kbd>`, `<br>`, `<details>`…).
 *   It is NOT trusted: everything is sanitized afterwards (see sanitize.ts).
 * - Links using `javascript:`, `vbscript:`, `file:` and non-image `data:` are already
 *   refused by markdown-it itself and rendered as plain text.
 */
export function createMarkdown(plugins: MarkdownPlugin[] = []): Markdown {
  const md = new MarkdownIt({
    html: true,
    linkify: false, // bare "file.md" must not turn into a link
    breaks: false, // a single newline stays a space; end a line with two spaces or "\" for <br>
    typographer: false,
  });
  for (const plugin of plugins) plugin(md);
  return md;
}
