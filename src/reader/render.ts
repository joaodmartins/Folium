import { splitFrontmatter } from '../../tools/vite-plugin-folium/split-frontmatter';
import { assignHeadingIds, type Heading } from './headings';
import { createMarkdown, type Markdown } from './markdown';
import { resolveLinksAndImages, type ResolveContext } from './resolve';
import { sanitizeHtml } from './sanitize';

export interface RenderContext extends ResolveContext {
  /** Title of the book, used to avoid showing it twice (page header + first H1). */
  title: string;
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
 * markdown-it → sanitize → resolve relative links/images → heading ids → tidy-ups.
 */
export function renderMarkdown(source: string, ctx: RenderContext): RenderedBook {
  markdown ??= createMarkdown();
  const { body } = splitFrontmatter(source);

  const element = document.createElement('div');
  element.className = 'prose';
  element.append(sanitizeHtml(markdown.render(body)));

  resolveLinksAndImages(element, ctx);
  const headings = assignHeadingIds(element);
  tidy(element, headings, ctx.title);
  return { element, headings };
}

function tidy(root: HTMLElement, headings: Heading[], bookTitle: string) {
  // The page header already shows the title: hide a leading H1 that repeats it (it stays in
  // the DOM and in `headings`; `hidden` also removes it from the accessibility tree).
  const first = root.firstElementChild;
  if (first && /^H1$/.test(first.tagName) && headings[0]?.text.toLowerCase() === bookTitle.trim().toLowerCase()) {
    first.setAttribute('hidden', '');
  }

  // Wide code blocks and tables scroll inside themselves; make them reachable by keyboard.
  for (const pre of root.querySelectorAll('pre')) pre.setAttribute('tabindex', '0');
  for (const table of root.querySelectorAll('table')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrap';
    wrapper.setAttribute('tabindex', '0');
    table.replaceWith(wrapper);
    wrapper.append(table);
  }
}
