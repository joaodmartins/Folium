import { el } from '../../dom';
import type { Paginator } from '../paginator/types';

/**
 * The faces of a turning page are copies of the real pages. They are built from the content
 * that is on those pages only (not the whole book), laid out with the same column size so that
 * every line falls where it falls in the real book, and discarded when the animation ends.
 */

/** A block that spans more pages than this is too big to copy for an animation (the turn is a plain fade). */
const MAX_BLOCK_SPAN = 8;

export type PageSize = Paginator['pageSize'];

export interface Paper {
  /** Size of the whole page, margins included. */
  width: number;
  height: number;
  /** Where the text window starts inside the page. */
  textLeft: number;
  textTop: number;
}

interface Piece {
  block: Element;
  startPage: number;
  /** Distance from the top of the columns to where the block starts (in its first column). */
  startTop: number;
}

/** Top-level blocks of the content that have text on `page`. `null` if one of them is too big to copy. */
function piecesOnPage(content: HTMLElement, page: number, size: PageSize): Piece[] | null {
  const base = content.getBoundingClientRect();
  const step = size.width + size.gap;
  const pageAt = (x: number) => Math.floor((x - base.left + 1) / step);

  const pieces: Piece[] = [];
  for (const block of content.children) {
    if (block.hasAttribute('hidden')) continue;
    const boxes = block.getClientRects();
    if (boxes.length === 0) continue;
    const first = boxes[0];
    const startPage = pageAt(first.left);
    const endPage = pageAt(boxes[boxes.length - 1].left);
    if (startPage > page || endPage < page) continue;
    if (endPage - startPage > MAX_BLOCK_SPAN) return null;
    pieces.push({ block, startPage, startTop: first.top - base.top });
  }
  return pieces;
}

/** The text of one page, as a detached element laid out like the real page. `null` when it cannot be copied. */
export function copyPageText(content: HTMLElement, page: number, size: PageSize): HTMLElement | null {
  const pieces = piecesOnPage(content, page, size);
  if (pieces === null) return null;

  const strip = document.createElement('div');
  strip.className = 'flip__copy'; // styled like the book's text (see app.css), but not matched as the real content
  const style = strip.style;
  style.width = `${size.width}px`;
  style.height = `${size.height}px`;
  style.columnWidth = `${size.width}px`;
  style.columnGap = `${size.gap}px`;
  style.columnFill = 'auto';
  style.setProperty('--page-h', `${size.height}px`);

  if (pieces.length > 0) {
    // The copy starts at the first block that has text on this page. If that block began on an
    // earlier page, or lower on its page, a spacer puts it exactly where it was (and its own top
    // margin is already part of that distance), so it breaks the same way.
    const [first] = pieces;
    strip.append(el('div', { style: `height:${Math.max(0, first.startTop)}px;margin:0;padding:0` }));
    pieces.forEach(({ block }, index) => {
      const copy = block.cloneNode(true) as HTMLElement;
      if (index === 0) copy.style.marginTop = '0';
      strip.append(copy);
    });
    style.transform = `translateX(${-(page - first.startPage) * (size.width + size.gap)}px)`;
  }

  // It is only a picture: no ids (they must stay unique), nothing focusable, nothing for screen readers.
  for (const node of strip.querySelectorAll('[id]')) node.removeAttribute('id');
  strip.setAttribute('inert', '');
  strip.setAttribute('aria-hidden', 'true');
  return strip;
}

/** A page of paper (blank, or showing the text of `page`) sized `paper`, ready to be placed and turned. */
export function renderFace(
  content: HTMLElement,
  page: number | null,
  size: PageSize,
  paper: Paper,
  className: string,
): HTMLElement | null {
  const face = el('div', { class: `flip__face ${className}` });
  face.style.width = `${paper.width}px`;
  face.style.height = `${paper.height}px`;

  if (page !== null) {
    const text = copyPageText(content, page, size);
    if (text === null) return null;
    const window = el('div', { class: 'flip__window' }, text);
    window.style.cssText = `left:${paper.textLeft}px;top:${paper.textTop}px;width:${size.width}px;height:${size.height}px`;
    face.append(window);
  }
  face.append(el('div', { class: 'flip__shade' }));
  return face;
}
