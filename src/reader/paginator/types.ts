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
  /** Current page, 0-based. */
  readonly page: number;
  readonly pageCount: number;

  /** Shows a page (clamped to the valid range). */
  goTo(page: number): void;
  /** Shows the next/previous page. Returns false when there is none. */
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

/**
 * `viewport` is the clipped "page window" (its size is the size of one page);
 * `content` is the element holding the book's content, which the paginator lays out in pages.
 */
export type PaginatorFactory = (viewport: HTMLElement, content: HTMLElement) => Promise<Paginator>;
