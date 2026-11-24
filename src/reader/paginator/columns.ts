import type { PageState, Paginator, PaginatorFactory, PaginatorOptions } from './types';

export interface ColumnsOptions extends PaginatorOptions {
  /** Give up waiting for slow images after this many ms. Default: 4000. */
  imageTimeout?: number;
}

const TURN_MS = 220;
const TURN = `transform ${TURN_MS}ms ease`;
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Pagination with CSS multi-column layout: `content` is a box exactly one page wide and
 * one page tall whose text flows into columns; every column is a page. Pages are shown by
 * sliding the content horizontally inside the clipped `viewport`.
 *
 * The browser does the hard part (line breaking, `break-inside: avoid`, widows/orphans);
 * this code measures the result, keeps the reading position when the size changes, and
 * exposes the page-turning API.
 */
export async function createColumnsPaginator(
  viewport: HTMLElement,
  content: HTMLElement,
  options: ColumnsOptions = {},
): Promise<Paginator> {
  const gap = options.gap ?? 40;
  const animate = options.animate ?? true;

  const listeners = new Set<(state: PageState) => void>();
  let page = 0;
  let pageCount = 1;
  let width = 0;
  let height = 0;
  let view = 1; // pages on screen at once
  let destroyed = false;
  let frame = 0;
  let forceNext = false;

  const step = () => width + gap;
  const clamp = (value: number) => Math.min(Math.max(Math.trunc(value) || 0, 0), pageCount - 1);
  /** A view starts on its first page: with two pages per view, page 3 is shown with page 2. */
  const snap = (value: number) => value - (value % view);
  const wantedView = () => Math.max(1, Math.floor(options.pagesPerView?.() ?? 1) || 1);

  // ---- showing a page ------------------------------------------------------------------

  const emit = () => {
    const state = { page, pageCount };
    for (const listener of [...listeners]) listener(state);
  };

  const show = (target: number, animated: boolean) => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    content.style.transition = animated && animate && !reduced ? TURN : 'none';
    content.style.transform = `translateX(${-target * step()}px)`;
  };

  const setPage = (target: number, animated: boolean) => {
    const next = snap(clamp(target));
    show(next, animated);
    if (next !== page) {
      page = next;
      emit();
    }
    rememberPlaceSoon(animated);
  };

  // ---- measuring -----------------------------------------------------------------------

  /** Page (0-based) containing a horizontal position, relative to the left edge of the content. */
  const pageAt = (x: number) => clamp(Math.floor((x + 1) / step()));

  const pageOf = (element: Element): number => {
    const rect = element.getClientRects()[0]; // first fragment: where the element starts
    if (!rect) return 0; // not rendered (e.g. hidden)
    return pageAt(rect.left - content.getBoundingClientRect().left);
  };

  function measure(): number {
    if (width <= 0 || height <= 0) return 1;
    // N pages = N columns + (N - 1) gaps; the small tolerance absorbs sub-pixel rounding.
    return Math.max(1, Math.ceil((content.scrollWidth + gap) / step() - 0.02));
  }

  // ---- keeping the reading position ----------------------------------------------------

  type Place = { node: Node; offset: number };

  /** The text (or element) at the top-left of the page being shown. */
  function capturePlace(): Place | null {
    const box = viewport.getBoundingClientRect();
    for (const dy of [2, 12, 28, 48]) {
      const hit = caretAt(box.left + 2, box.top + dy);
      if (hit && content.contains(hit.node)) return hit;
    }
    return null;
  }

  function pageOfPlace(place: Place): number | null {
    if (!content.contains(place.node)) return null;
    const range = document.createRange();
    if (place.node.nodeType === Node.TEXT_NODE) {
      const length = (place.node as Text).length;
      if (length === 0) return null;
      const start = Math.min(place.offset, length - 1);
      range.setStart(place.node, start);
      range.setEnd(place.node, start + 1);
    } else {
      range.selectNode(place.node.childNodes[place.offset] ?? place.node);
    }
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0 && rect.left === 0)) return null;
    return pageAt(rect.left - content.getBoundingClientRect().left);
  }

  // The place being read is remembered while the layout is stable. When the size changes, CSS
  // (media queries, fonts) may already have reflowed the text before we get to measure, so looking
  // at the screen at that point would find the wrong text.
  let place: Place | null = null;
  let placePage = -1; // the page `place` was taken on (-1: not known yet)
  let placeTimer: ReturnType<typeof setTimeout> | undefined;

  function rememberPlace() {
    placeTimer = undefined;
    place = page > 0 ? capturePlace() : null;
    placePage = page;
  }

  /** After a page turn animation, the text on screen is the new page; remember it then. */
  function rememberPlaceSoon(animated: boolean) {
    clearTimeout(placeTimer);
    placePage = -1;
    if (animated && content.style.transition !== 'none') placeTimer = setTimeout(rememberPlace, TURN_MS + 60);
    else rememberPlace();
  }

  // ---- layout --------------------------------------------------------------------------

  /** (Re)lays the content out for the current viewport size. `keep` preserves the position. */
  function layout(keep: boolean) {
    let reading: Place | null = null;
    if (keep && page > 0) {
      if (placePage === page && place) {
        reading = place;
      } else {
        // A page turn is still sliding: look at where the reader is going, not at the animation.
        show(page, false);
        reading = capturePlace();
      }
    }

    const previousView = view;
    view = wantedView();
    // The viewport holds `view` pages and the gaps between them.
    width = Math.floor((viewport.clientWidth - (view - 1) * gap) / view);
    height = Math.floor(viewport.clientHeight);
    if (width > 0 && height > 0) {
      const s = content.style;
      s.width = `${width}px`;
      s.height = `${height}px`;
      s.columnWidth = `${width}px`;
      s.columnGap = `${gap}px`;
      s.columnFill = 'auto';
      s.setProperty('--page-h', `${height}px`);
    }

    if (width > 0 && height > 0) options.beforeMeasure?.({ width, height, gap });

    const previousCount = pageCount;
    pageCount = measure();

    let target = page;
    if (reading) target = pageOfPlace(reading) ?? Math.min(page, pageCount - 1);
    target = snap(clamp(target));

    show(target, false);
    if (target !== page || pageCount !== previousCount || view !== previousView) {
      page = target;
      emit();
    }
    clearTimeout(placeTimer);
    rememberPlace();
    options.onLayout?.();
  }

  // ---- keeping up with changes ---------------------------------------------------------

  let measuredWidth = 0;
  let measuredHeight = 0;
  let measuredView = 1;

  const relayout = () => {
    frame = 0;
    if (destroyed) return;
    const w = Math.floor(viewport.clientWidth);
    const h = Math.floor(viewport.clientHeight);
    const v = wantedView();
    if (!forceNext && w === measuredWidth && h === measuredHeight && v === measuredView) return; // nothing changed: no work, no loops
    forceNext = false;
    measuredWidth = w;
    measuredHeight = h;
    measuredView = v;
    layout(true);
  };

  /** Coalesces any number of triggers into one measurement per frame. */
  const schedule = (force = false) => {
    if (destroyed) return;
    forceNext ||= force;
    if (!frame) frame = requestAnimationFrame(relayout);
  };

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null;
  resizeObserver?.observe(viewport);

  const onContentChanged = () => schedule(true);
  // Images finishing (or failing) to load and <details> opening change the height of the content.
  content.addEventListener('load', onContentChanged, true);
  content.addEventListener('error', onContentChanged, true);
  content.addEventListener('toggle', onContentChanged, true);
  document.fonts?.addEventListener?.('loadingdone', onContentChanged);

  // A focused element on another page, or find-in-page, makes the browser scroll the clipped
  // viewport: follow it to the right page instead of leaving the layout shifted.
  const onViewportScroll = () => {
    const shift = viewport.scrollLeft;
    if (shift === 0) return;
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
    setPage(page + Math.round(shift / step()), false);
  };
  viewport.addEventListener('scroll', onViewportScroll);
  const onFocusIn = (event: FocusEvent) => {
    if (event.target instanceof Element) setPage(pageOf(event.target), false);
  };
  content.addEventListener('focusin', onFocusIn);

  // ---- start: wait until the content has its final size --------------------------------

  await nextFrame();
  await Promise.all([fontsLoaded(content), ...pendingImages(content, options.imageTimeout ?? 4000)]);
  measuredWidth = Math.floor(viewport.clientWidth);
  measuredHeight = Math.floor(viewport.clientHeight);
  measuredView = wantedView();
  layout(false);

  return {
    get page() {
      return page;
    },
    get pageCount() {
      return pageCount;
    },
    get pagesPerView() {
      return view;
    },
    get pageSize() {
      return { width, height, gap };
    },
    goTo: (target) => setPage(target, false),
    next() {
      if (page + view >= pageCount) return false;
      setPage(page + view, true);
      return true;
    },
    prev() {
      if (page <= 0) return false;
      setPage(page - view, true);
      return true;
    },
    pageOf,
    goToElement: (element) => setPage(pageOf(element), false),
    refresh() {
      if (destroyed) return;
      cancelAnimationFrame(frame);
      frame = 0;
      forceNext = false;
      measuredWidth = Math.floor(viewport.clientWidth);
      measuredHeight = Math.floor(viewport.clientHeight);
      measuredView = wantedView();
      layout(true);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      clearTimeout(placeTimer);
      resizeObserver?.disconnect();
      content.removeEventListener('load', onContentChanged, true);
      content.removeEventListener('error', onContentChanged, true);
      content.removeEventListener('toggle', onContentChanged, true);
      content.removeEventListener('focusin', onFocusIn);
      document.fonts?.removeEventListener?.('loadingdone', onContentChanged);
      viewport.removeEventListener('scroll', onViewportScroll);
      listeners.clear();
    },
  };
}

/** Compile-time check that the factory type matches. */
export const columnsPaginator: PaginatorFactory = (viewport, content, options) =>
  createColumnsPaginator(viewport, content, options);

/**
 * Resolves when the fonts the content needs are loaded (book text, KaTeX's math fonts…). A font only
 * starts loading once text that uses it has been laid out, so the content is laid out first; if that
 * starts more loads (one font leading to another), it waits again, a few times at most. Fonts that
 * arrive later still trigger a new measurement (see the `loadingdone` listener).
 */
async function fontsLoaded(content: HTMLElement): Promise<void> {
  const fonts = document.fonts;
  if (!fonts) return;
  for (let round = 0; round < 4; round++) {
    content.getBoundingClientRect(); // forces the layout that makes the browser request the fonts
    await fonts.ready;
    if (fonts.status === 'loaded') return;
  }
}

/** Promises for images that are not loaded yet (capped, so one slow image cannot block reading). */
function pendingImages(root: HTMLElement, timeout: number): Promise<unknown>[] {
  return [...root.querySelectorAll('img')]
    .filter((img) => !img.complete || img.naturalWidth === 0)
    .map((img) =>
      Promise.race([
        (typeof img.decode === 'function' ? img.decode() : Promise.resolve()).catch(() => undefined), // broken images: 'error' event
        new Promise((resolve) => setTimeout(resolve, timeout)),
      ]),
    );
}

/** Text position under a point: `caretPositionFromPoint` (standard) or `caretRangeFromPoint` (WebKit/Blink). */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}
