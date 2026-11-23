import type { MarkdownPlugin } from './markdown';

// `<!-- pagebreak -->` on its own line (case and spacing are forgiving).
const MARKER = /^\s*<!--\s*pagebreak\s*-->\s*$/i;

/** Class of the placeholder element the plugin emits; `applyPageBreaks` consumes it. */
export const PAGEBREAK_CLASS = 'pagebreak';

/**
 * Turns `<!-- pagebreak -->` into a marker element. Comments would otherwise be removed
 * by the sanitizer, and the marker is what tells the paginator where to start a page.
 * In any other Markdown viewer the line is just an invisible HTML comment.
 */
export const pageBreakPlugin: MarkdownPlugin = (md) => {
  for (const rule of ['html_block', 'html_inline'] as const) {
    const fallback = md.renderer.rules[rule] ?? ((tokens, idx) => tokens[idx].content);
    md.renderer.rules[rule] = (tokens, idx, options, env, self) =>
      MARKER.test(tokens[idx].content)
        ? `<div class="${PAGEBREAK_CLASS}" role="presentation"></div>\n`
        : fallback(tokens, idx, options, env, self);
  }
};
