import { splitFrontmatter } from '../../tools/vite-plugin-folium/split-frontmatter';
import type { ChapterBreak } from '../../tools/vite-plugin-folium/types';
import { assignHeadingIds, type Heading } from './headings';
import { addCopyButtons, listenForCopyClicks } from './code-blocks';
import { highlightPlugin } from './highlight';
import { createMarkdown, type Markdown } from './markdown';
import { mathPlugin, renderMath } from './math';
import { pageBreakPlugin } from './pagebreak';
import { applyPageBreaks } from './pages';
import { resolveLinksAndImages, type ResolveContext } from './resolve';
import { sanitizeHtml } from './sanitize';

export interface RenderContext extends ResolveContext {
  /** Title of the book, used to avoid showing it twice (page header + first H1). */
  title: string;
  /** Which headings start a new page (the book's `chapterBreak`). Default: "none". */
  chapterBreak?: ChapterBreak;
}

export interface RenderedBook {
  /** Safe DOM of the book's content (sanitized, links/images resolved, headings with ids). */
  element: HTMLElement;
  /** Every heading in order: input for the table of contents and, later, pagination. */
  headings: Heading[];
}

let markdown: Markdown | undefined;

/**
 * Markdown source (frontmatter included) → safe DOM.
 * markdown-it (page breaks, math markers, syntax highlighting) → sanitize → resolve relative
 * links/images → heading ids → tidy-ups → formulas (KaTeX) and Copy buttons, which must come after
 * sanitizing. Everything is synchronous: when this returns the content is complete and can be measured
 * (the fonts KaTeX uses are awaited by the paginator, which measures once they are loaded).
 */
export function renderMarkdown(source: string, ctx: RenderContext): RenderedBook {
  markdown ??= createMarkdown([pageBreakPlugin, mathPlugin, highlightPlugin]);
  const { body } = splitFrontmatter(source);

  const element = document.createElement('div');
  element.className = 'prose';
  element.append(sanitizeHtml(markdown.render(body)));

  resolveLinksAndImages(element, ctx);
  const headings = assignHeadingIds(element);
  tidy(element, headings, ctx.title);
  applyPageBreaks(element, ctx.chapterBreak ?? 'none');
  renderMath(element);
  addCopyButtons(element);
  listenForCopyClicks(element);
  return { element, headings };
}

function tidy(root: HTMLElement, headings: Heading[], bookTitle: string) {
  // The page header already shows the title: hide a leading H1 that repeats it (it stays in
  // the DOM and in `headings`; `hidden` also removes it from the accessibility tree).
  const first = root.firstElementChild;
  if (first && /^H1$/.test(first.tagName) && headings[0]?.text.toLowerCase() === bookTitle.trim().toLowerCase()) {
    first.setAttribute('hidden', '');
  }

  // The first thing in the book sits at the very top of the first page, like the top of any other page.
  const firstVisible = [...root.children].find((child) => !child.hasAttribute('hidden'));
  firstVisible?.classList.add('first-block');

  // Wide or tall tables scroll inside a wrapper. (Tables and code blocks that scroll become focusable
  // once the page size is known, see markScrollableTables and markScrollableCode.)
  for (const table of root.querySelectorAll('table')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrap';
    table.replaceWith(wrapper);
    wrapper.append(table);
    sizeColumns(table);
  }
}

/** Narrowest a column of short entries (numbers, names, codes) is allowed to get, in rem. */
const NARROW_COLUMN = 5;

/**
 * A table is never squeezed until its text is unreadable: it keeps a width that suits what each column holds
 * (a column of long sentences needs more room than one of numbers) and scrolls sideways when the page has
 * less than that. The widths depend on the text only, not on the page, so they are set once, here.
 */
function sizeColumns(table: HTMLTableElement): void {
  const longest: number[] = [];
  for (const row of table.rows) {
    [...row.cells].forEach((cell, column) => {
      if (cell.colSpan === 1) longest[column] = Math.max(longest[column] ?? 0, (cell.textContent ?? '').trim().length);
    });
  }
  for (const row of table.rows) {
    [...row.cells].forEach((cell, column) => {
      const length = longest[column] ?? 0;
      const rem = length >= 60 ? 10 : length >= 25 ? 8 : NARROW_COLUMN;
      if (rem > NARROW_COLUMN && cell.colSpan === 1) cell.style.minWidth = `${rem}rem`;
    });
  }
}
