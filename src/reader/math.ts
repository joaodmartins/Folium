import { tex } from '@mdit/plugin-tex';
import katex from 'katex';
import type { MarkdownPlugin } from './markdown';
import { sanitizeMath } from './sanitize';

/**
 * Math: `$…$` inline and `$$…$$` as a block (the delimiters are parsed by @mdit/plugin-tex; the
 * maths is rendered by KaTeX).
 *
 * Markdown-it only leaves a marker with the TeX source as its (escaped) text. KaTeX's output
 * needs `style` attributes and SVG/MathML, which the book sanitizer removes, so it cannot go
 * through it: `renderMath` replaces the markers *after* sanitizing, and the KaTeX output has its own,
 * separate sanitizing (see `sanitizeMath`). Nothing the author writes reaches the page as HTML.
 */

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const MATH_CLASS = 'math';

export const mathPlugin: MarkdownPlugin = (md) => {
  md.use(tex, {
    delimiters: 'dollars',
    render: (content, displayMode) =>
      displayMode
        ? `<div class="${MATH_CLASS} ${MATH_CLASS}--display">${escapeHtml(content)}</div>\n`
        : `<span class="${MATH_CLASS} ${MATH_CLASS}--inline">${escapeHtml(content)}</span>`,
  });
};

/** What KaTeX is allowed to do: no `\href`/`\url`/`\includegraphics`/`\htmlId…` (trust is off), bounded size and expansion. */
const KATEX_OPTIONS = {
  throwOnError: true,
  trust: false,
  strict: 'ignore',
  output: 'htmlAndMathml', // the MathML is what screen readers read
  maxSize: 50,
  maxExpand: 1000,
} as const;

/** Replaces every math marker under `root` by the rendered formula (or, if the TeX is invalid, by its source). */
export function renderMath(root: ParentNode): void {
  for (const marker of root.querySelectorAll<HTMLElement>(`.${MATH_CLASS}`)) {
    const source = (marker.textContent ?? '').trim();
    const display = marker.classList.contains(`${MATH_CLASS}--display`);
    try {
      const html = katex.renderToString(source, { ...KATEX_OPTIONS, displayMode: display });
      marker.replaceChildren(...sanitizeMath(html).childNodes);
      marker.classList.add(`${MATH_CLASS}--rendered`);
    } catch (error) {
      // An invalid formula must not stop the book: show what was written, quietly marked.
      const code = document.createElement('code');
      code.textContent = display ? `$$${source}$$` : `$${source}$`;
      marker.replaceChildren(code);
      marker.classList.add(`${MATH_CLASS}--error`);
      marker.title = error instanceof Error ? error.message.replace(/^KaTeX parse error:\s*/, '') : 'Invalid formula';
    }
  }
}

export { markScrollableFormulas } from './scrollable-formulas';
