/**
 * Size of the open book for the space available. Pure maths (no DOM), so it can be tested:
 * the reader measures the stage, calls this, and sets the result as CSS variables.
 */

export interface Area {
  width: number;
  height: number;
}

export interface BookLayout {
  /** 2: open book (two pages side by side); 1: one page at a time. */
  pages: 1 | 2;
  /** Size of one page (its paper, margins included), in px. */
  pageWidth: number;
  pageHeight: number;
  /** Margin between the page edge and its text: outer side, top and bottom. */
  marginX: number;
  marginY: number;
  /** Space between the two text columns of an open book (the inner margins of both pages). */
  gutter: number;
  /** Width of the whole book: one page or two. */
  bookWidth: number;
}

/** Space left around the book inside the stage. */
export const EDGE = 12;
/** Gap between two columns of text. Both modes use it (single pages simply never show it). */
export const GUTTER = 48;

/** A page is about 2:3 (width : height). Wider is not wanted: long lines are hard to read. */
const PAGE_RATIO = 0.72;
/** Needed to open the book: text columns that are comfortable, and pages that are not too narrow or short. */
const MIN_TEXT_WIDTH = 300;
const MIN_PAGE_HEIGHT = 420;
const MIN_PAGE_ASPECT = 0.55;
/** A single page is never wider than this (46rem), however big the screen. */
const MAX_SINGLE_PAGE_WIDTH = 736;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function margins(pageWidth: number, pageHeight: number) {
  return {
    marginX: Math.round(clamp(pageWidth * 0.09, 18, 56)),
    marginY: Math.round(clamp(pageHeight * 0.055, 16, 48)),
  };
}

export function computeBookLayout(area: Area): BookLayout {
  const availableWidth = Math.max(0, Math.floor(area.width - 2 * EDGE));
  const availableHeight = Math.max(0, Math.floor(area.height - 2 * EDGE));

  // Open book: the pages take the full height; their width follows the ratio unless the screen is narrower.
  const openPageHeight = availableHeight;
  const openPageWidth = Math.floor(Math.min(availableWidth / 2, openPageHeight * PAGE_RATIO));
  const open = margins(openPageWidth, openPageHeight);
  const textWidth = openPageWidth - open.marginX - GUTTER / 2;

  if (
    textWidth >= MIN_TEXT_WIDTH &&
    openPageHeight >= MIN_PAGE_HEIGHT &&
    openPageWidth / openPageHeight >= MIN_PAGE_ASPECT
  ) {
    return {
      pages: 2,
      pageWidth: openPageWidth,
      pageHeight: openPageHeight,
      ...open,
      gutter: GUTTER,
      bookWidth: openPageWidth * 2,
    };
  }

  const pageWidth = Math.min(availableWidth, MAX_SINGLE_PAGE_WIDTH);
  return {
    pages: 1,
    pageWidth,
    pageHeight: availableHeight,
    ...margins(pageWidth, availableHeight),
    gutter: GUTTER,
    bookWidth: pageWidth,
  };
}

/** Size of the area that holds the text columns (what the paginator measures). */
export function textArea(layout: BookLayout): Area {
  const width = layout.bookWidth - 2 * layout.marginX;
  return { width, height: layout.pageHeight - 2 * layout.marginY };
}

export const sameLayout = (a: BookLayout, b: BookLayout) =>
  a.pages === b.pages && a.pageWidth === b.pageWidth && a.pageHeight === b.pageHeight;
