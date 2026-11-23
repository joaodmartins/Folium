import { el } from '../../dom';
import type { BookLayout } from '../layout';
import type { Paginator } from '../paginator/types';
import { renderFace, type Paper } from './faces';

export interface PageTurner {
  /** Turns to the next (1) or previous (-1) view with an animation. False when there is nowhere to go. */
  turn(direction: 1 | -1): boolean;
  /** Ends a running animation at once (the book is already showing the destination). */
  finish(): void;
  readonly busy: boolean;
  destroy(): void;
}

export interface TurnerOptions {
  paginator: Paginator;
  /** The content laid out in columns by the paginator. */
  content: HTMLElement;
  /** The book element (gets `data-turning` while a turn runs), its viewport, and the overlay for turning pages. */
  book: HTMLElement;
  viewport: HTMLElement;
  flipLayer: HTMLElement;
  layout: () => BookLayout;
  /** Defaults to the `prefers-reduced-motion` media query. */
  reducedMotion?: () => boolean;
  /** Length of a page turn in ms. Default: 600 (open book) / 480 (single page). */
  duration?: number;
}

const EASING = 'cubic-bezier(0.45, 0.05, 0.25, 1)';
const SHADE = [{ opacity: 0 }, { opacity: 0.55, offset: 0.5 }, { opacity: 0 }];
const CAST = [{ opacity: 0 }, { opacity: 0.4 }];

const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const canAnimate = () => typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';

/**
 * Draws the page turns of the open book (or the single page).
 *
 * The real book never waits for the animation: `turn()` moves the paginator to the destination at
 * once (so page numbers, buttons and anchors are always right), and a temporary layer on top shows
 * the old pages and the turning leaf until it finishes. That layer holds copies of just the pages
 * involved, so it is cheap and cannot get out of step with the content. Only one turn runs at a
 * time: a new one first ends the running one.
 */
export function createPageTurner(options: TurnerOptions): PageTurner {
  const { paginator, content, book, viewport, flipLayer } = options;
  let running: { animations: Animation[] } | null = null;
  let destroyed = false;

  const reduced = () => (options.reducedMotion ?? prefersReducedMotion)();

  function cleanup() {
    running?.animations.forEach((animation) => animation.cancel());
    running = null;
    flipLayer.replaceChildren();
    book.removeAttribute('data-turning');
    book.removeAttribute('data-turn');
  }

  /** The layer for one turn, or null when the pages cannot be copied (then the turn is a fade). */
  function buildLayer(direction: 1 | -1, from: number, layout: BookLayout) {
    const size = paginator.pageSize;
    const open = paginator.pagesPerView === 2;
    const pageCount = paginator.pageCount;
    const textTop = layout.marginY;

    const paper = (textLeft: number): Paper => ({ width: layout.pageWidth, height: layout.pageHeight, textLeft, textTop });
    const left = paper(layout.marginX); // text of a page on the left (or a single page)
    const right = paper(open ? layout.gutter / 2 : layout.marginX); // text of the right-hand page
    const face = (page: number | null, p: Paper, cls: string) => renderFace(content, page, size, p, cls);

    // The leaf is the page being turned: its front is the right-hand page, its back the left-hand one.
    const leafSpot = open ? layout.pageWidth : 0;
    let front: HTMLElement | null;
    let back: HTMLElement | null;
    let still: { node: HTMLElement | null; x: number } | null;

    if (direction === 1) {
      front = face(from + (open ? 1 : 0), right, 'flip__face--front');
      back = open ? face(from + 2, left, 'flip__face--back') : face(null, left, 'flip__face--back');
      still = open ? { node: face(from, left, 'flip__face--still'), x: 0 } : null; // the old left page, until the leaf covers it
    } else {
      front = face(from - 1, right, 'flip__face--front');
      back = open ? face(from, left, 'flip__face--back') : face(null, left, 'flip__face--back');
      const oldRight = open && from + 1 < pageCount ? from + 1 : null;
      // Going back, what the leaf lands on is the old right page (single page: the page we leave).
      still = open
        ? oldRight === null
          ? null
          : { node: face(oldRight, right, 'flip__face--still'), x: layout.pageWidth }
        : { node: face(from, left, 'flip__face--still'), x: 0 };
    }
    if (!front || !back || (still && !still.node)) return null;

    const leaf = el('div', { class: 'flip__leaf' }, front, back);
    leaf.style.cssText = `left:${leafSpot}px;width:${layout.pageWidth}px;height:${layout.pageHeight}px`;

    const nodes: HTMLElement[] = [];
    if (still?.node) {
      const holder = el('div', { class: 'flip__still' }, still.node);
      holder.style.cssText = `left:${still.x}px;width:${layout.pageWidth}px;height:${layout.pageHeight}px`;
      nodes.push(holder);
    }
    nodes.push(leaf);
    return { nodes, leaf, still: still?.node ?? null, shades: [front, back] };
  }

  function turn(direction: 1 | -1): boolean {
    if (destroyed) return false;
    cleanup(); // never two turns at once

    const from = paginator.page;
    const to = from + direction * paginator.pagesPerView;
    if (to < 0 || to >= paginator.pageCount) return false;

    const animate = canAnimate();
    const motion = animate && !reduced();
    const layer = motion && paginator.pageSize.width > 0 ? buildLayer(direction, from, options.layout()) : null;

    paginator.goTo(to); // the real book is at its destination from now on

    if (!animate) return true;
    const animations: Animation[] = [];
    book.setAttribute('data-turning', 'true');

    if (layer) {
      const duration = options.duration ?? (paginator.pagesPerView === 2 ? 600 : 480);
      book.setAttribute('data-turn', direction === 1 ? 'forward' : 'backward');
      flipLayer.replaceChildren(...layer.nodes);
      const [start, end] = direction === 1 ? [0, -180] : [-180, 0];
      animations.push(
        layer.leaf.animate(
          [{ transform: `rotateY(${start}deg)` }, { transform: `rotateY(${end}deg)` }],
          { duration, easing: EASING, fill: 'both' },
        ),
      );
      for (const face of layer.shades) {
        animations.push(face.querySelector('.flip__shade')!.animate(SHADE, { duration, easing: EASING, fill: 'both' }));
      }
      if (layer.still) {
        const cast = layer.still.querySelector('.flip__shade')!;
        animations.push(cast.animate(direction === 1 ? CAST : [...CAST].reverse(), { duration, easing: 'linear', fill: 'both' }));
      }
    } else {
      // Reduced motion, or pages too long to copy: a short fade, no 3D.
      animations.push(viewport.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' }));
    }

    const current = { animations };
    running = current;
    void Promise.all(animations.map((animation) => animation.finished)).then(
      () => {
        if (running === current) cleanup();
      },
      () => {
        // Cancelled by finish()/a newer turn: that already cleaned up.
      },
    );
    return true;
  }

  return {
    turn,
    finish: cleanup,
    get busy() {
      return running !== null;
    },
    destroy() {
      destroyed = true;
      cleanup();
    },
  };
}
