export interface PageState {
  /** Current page, 0-based. */
  page: number;
  pageCount: number;
}

/**
 * Splits a book into pages and moves between them. The reader only talks to this
 * interface, so the engine (CSS columns today) can be replaced without touching it.
 */
export interface Paginator {
  /** First visible page, 0-based. With two pages per view it is always an even number (the left page). */
  readonly page: number;
  readonly pageCount: number;
  /** How many pages are on screen at once: 1, or 2 for an open book. */
  readonly pagesPerView: number;
  /** Size of one page of text and the space between two pages, in px (0 until measured). */
  readonly pageSize: { width: number; height: number; gap: number };

  /** Shows a page (clamped to the valid range). With two pages per view, the spread that contains it. */
  goTo(page: number): void;
  /** Shows the next/previous view (one page, or one spread). Returns false when there is none. */
  next(): boolean;
  prev(): boolean;

  /** Page (0-based) on which an element of the content starts. */
  pageOf(element: Element): number;
  /** Shows the page that contains the element. */
  goToElement(element: Element): void;

  /** Measures again now (use after the content or its styles changed). Position is kept. */
  refresh(): void;
  /** Called whenever the current page or the number of pages changes. Returns an unsubscribe function. */
  onChange(listener: (state: PageState) => void): () => void;
  /** Stops observing and releases listeners. */
  destroy(): void;
}

export interface PaginatorOptions {
  /** Pages shown at once (1, or 2 for an open book). Asked at every layout. Default: 1. */
  pagesPerView?: () => number;
  /** Space between two pages, in px. */
  gap?: number;
  /** Called after every layout (first measurement, resize, content changes): for things that depend on the page size. */
  onLayout?: () => void;
  /** Slide between pages (the reader draws its own page turns, so it turns this off). Default: true. */
  animate?: boolean;
}

/**
 * `viewport` is the clipped window onto the pages (as wide as the pages shown at once);
 * `content` is the element holding the book's content, which the paginator lays out in pages.
 */
export type PaginatorFactory = (
  viewport: HTMLElement,
  content: HTMLElement,
  options?: PaginatorOptions,
) => Promise<Paginator>;
