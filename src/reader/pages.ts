import type { ChapterBreak } from '../../tools/vite-plugin-folium/types';
import { PAGEBREAK_CLASS } from './pagebreak';

/** Elements with this class begin a new page (`break-before: column`, see app.css). */
export const PAGE_START_CLASS = 'page-start';

const isHeading = (el: Element) => /^H[1-6]$/.test(el.tagName);
const isMarker = (el: Element) => el.classList.contains(PAGEBREAK_CLASS);
const isSkipped = (el: Element) => el.hasAttribute('hidden') || isMarker(el);

function previousVisible(el: Element): Element | null {
  let prev = el.previousElementSibling;
  while (prev && isSkipped(prev)) prev = prev.previousElementSibling;
  return prev;
}

/** The element that follows `marker` in reading order, leaving containers when needed. */
function nextAfter(marker: Element, root: Element): Element | null {
  for (let node: Element | null = marker; node && node !== root; node = node.parentElement) {
    let next = node.nextElementSibling;
    while (next && isSkipped(next)) next = next.nextElementSibling;
    if (next) return next;
  }
  return null;
}

/** The child of `root` that contains `el` (or `el` itself). */
function topLevelOf(el: Element, root: Element): Element {
  let node = el;
  while (node.parentElement && node.parentElement !== root) node = node.parentElement;
  return node;
}

/**
 * Decides where pages start, as `page-start` classes (no marker elements are left behind):
 *  1. `<!-- pagebreak -->` markers: the next element starts a page. Markers at the very
 *     beginning or end of the book, and repeated markers, create no empty pages.
 *  2. `chapterBreak`: top-level headings of level ≤ N start a page ("h1" → H1, "h2" → H1 and H2).
 *     A heading directly after another heading that already starts a page does not break
 *     again, so a "Part" title is never left alone on a page.
 */
export function applyPageBreaks(root: HTMLElement, chapterBreak: ChapterBreak): void {
  for (const marker of [...root.querySelectorAll(`.${PAGEBREAK_CLASS}`)]) {
    const next = nextAfter(marker, root);
    marker.remove();
    if (!next) continue; // trailing marker
    const top = topLevelOf(next, root);
    const startsTheBook = top === next && previousVisible(next) === null;
    if (!startsTheBook) next.classList.add(PAGE_START_CLASS);
  }

  if (chapterBreak === 'none') return;
  const maxLevel = Number(chapterBreak[1]); // "h1" → 1, "h2" → 2

  const startsPage = (el: Element) => el.classList.contains(PAGE_START_CLASS) || previousVisible(el) === null;

  for (const heading of root.children) {
    if (!isHeading(heading) || heading.hasAttribute('hidden')) continue;
    if (Number(heading.tagName[1]) > maxLevel) continue;
    if (heading.classList.contains(PAGE_START_CLASS)) continue;

    const previous = previousVisible(heading);
    if (previous === null) continue; // first thing in the book
    if (isHeading(previous) && startsPage(previous)) continue; // keep "Part" + "Chapter" together
    heading.classList.add(PAGE_START_CLASS);
  }
}
