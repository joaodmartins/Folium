/**
 * Keeps headings with the text that follows them.
 *
 * CSS (`break-after: avoid`) asks the browser not to end a page on a heading, and usually that is
 * enough. It is only a request though: when a heading and the block after it cannot both fit on a
 * page (a code block almost as tall as the page, say) the browser gives up and leaves the heading
 * alone at the bottom of one page with its text on the next. This module makes it hold:
 *
 *  1. A code block, a table, a display formula or an image that follows headings is never taller than the page minus those
 *     headings (the code and the table scroll inside themselves, the image is scaled down: `--block-max` and
 *     `--media-max` in app.css), so heading and block always fit on one page together.
 *  2. After the browser has laid the pages out, any heading that ended up on a different page than
 *     the block after it is moved to the top of the next page (`keep-start`: a column break before
 *     it), and the layout is checked again, as moving it can move what follows.
 *
 * It never tries to keep a whole section together: only the heading (or a run of headings) and the
 * first block after it. Manual page breaks are respected: a block that starts a page on purpose
 * stays where the author put it.
 *
 * It runs before every measurement of the pages (it depends on the page size), starting from a
 * clean slate, so a book that is resized or changes fonts is laid out again from scratch.
 */

export const KEEP_CLASS = 'keep-start';
const PAGE_START_CLASS = 'page-start';
const FIRST_BLOCK_CLASS = 'first-block';

/** Properties of the page the content is laid out in (what the paginator just applied). */
export interface PageBox {
  width: number;
  height: number;
  gap: number;
}

/** More than this and the layout stops changing in practice; the limit only guards against loops. */
const MAX_PASSES = 6;
/** Room (px) left for a code block after the headings: below this the block is not squeezed any further. */
const MIN_CODE_ROOM = 96;
/** The border of a code block (`pre`) around its scrolling `code`. */
const PRE_BORDER = 2;

const isHeading = (el: Element) => /^H[1-6]$/.test(el.tagName);
const visibleChildren = (root: HTMLElement) => [...root.children].filter((child) => !child.hasAttribute('hidden'));

/** Height of a block with its margins (bottom margin only for the part that sits between blocks). */
function heightWithMargins(el: Element): number {
  const style = getComputedStyle(el);
  return el.getBoundingClientRect().height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
}

export function keepHeadingsWithContent(content: HTMLElement, page: PageBox): void {
  // Start from a clean slate.
  for (const marked of content.querySelectorAll(`.${KEEP_CLASS}`)) marked.classList.remove(KEEP_CLASS);
  for (const capped of content.querySelectorAll<HTMLElement>('[style*="--block-max"], [style*="--media-max"]')) {
    capped.style.removeProperty('--block-max');
    capped.style.removeProperty('--media-max');
  }
  if (page.width <= 0 || page.height <= 0) return;

  capBlocksAfterHeadings(content, page);

  const step = page.width + page.gap;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const left = content.getBoundingClientRect().left;
    const pageAt = (x: number) => Math.floor((x - left + 1) / step);
    const top = content.getBoundingClientRect().top;
    const blocks = visibleChildren(content);
    let moved = false;

    blocks.forEach((heading, index) => {
      const next = blocks[index + 1];
      if (!next || !isHeading(heading)) return;
      const startsPage = (el: Element) =>
        el.classList.contains(KEEP_CLASS) || el.classList.contains(PAGE_START_CLASS) || el.classList.contains(FIRST_BLOCK_CLASS);
      if (startsPage(heading) || next.classList.contains(PAGE_START_CLASS)) return; // already at the top, or the author's page break
      const headingBox = heading.getClientRects()[0];
      const nextBox = next.getClientRects()[0];
      if (!headingBox || !nextBox) return;
      if (pageAt(headingBox.left) === pageAt(nextBox.left)) return; // together: nothing to do
      if (headingBox.top - top < 2) return; // already at the top of its page: moving it would gain nothing
      heading.classList.add(KEEP_CLASS);
      moved = true;
    });

    if (!moved) return;
  }
}

/** Room (px) kept around a picture for its own margins (the image has 1rem above and below, its paragraph a bottom margin). */
const MEDIA_MARGIN = 56;

/** A paragraph or figure that holds a picture and nothing else. */
const isPicture = (el: Element) =>
  el.tagName === 'IMG' || (el.matches('p, figure') && el.querySelector('img') !== null && (el.textContent ?? '').trim() === '');

/** A code block, table or picture right after headings is no taller than the room a page has left after them. */
function capBlocksAfterHeadings(content: HTMLElement, page: PageBox): void {
  const blocks = visibleChildren(content);
  for (let i = 0; i < blocks.length; i++) {
    if (!isHeading(blocks[i]) || (i > 0 && isHeading(blocks[i - 1]))) continue; // start of a run of headings
    let end = i;
    while (end < blocks.length && isHeading(blocks[end])) end++;
    const next = blocks[end] as HTMLElement | undefined;
    if (!next) continue;

    const used = blocks.slice(i, end).reduce((sum, heading) => sum + heightWithMargins(heading), 0);
    if (next.tagName === 'PRE') {
      const room = Math.floor(page.height - used);
      const code = next.querySelector<HTMLElement>(':scope > code');
      const natural = (code ?? next).scrollHeight + PRE_BORDER;
      if (room >= MIN_CODE_ROOM && natural > room) next.style.setProperty('--block-max', `${room}px`);
    } else if (next.classList.contains('table-wrap')) {
      // a table scrolls inside its wrapper, like code: no taller than the room left after the headings
      const room = Math.floor(page.height - used);
      if (room >= MIN_CODE_ROOM && next.scrollHeight > room) next.style.setProperty('--block-max', `${room}px`);
    } else if (next.classList.contains('math--display')) {
      // a display formula taller than the room scrolls inside itself (the formula inside is capped by --block-max)
      const room = Math.floor(page.height - used);
      if (room >= MIN_CODE_ROOM && next.getBoundingClientRect().height > room) next.style.setProperty('--block-max', `${room}px`);
    } else if (isPicture(next)) {
      const room = Math.floor(page.height - used - MEDIA_MARGIN);
      if (room >= MIN_CODE_ROOM && next.getBoundingClientRect().height > room) next.style.setProperty('--media-max', `${room}px`);
    }
  }
}
