import type { Book } from '../../tools/vite-plugin-folium/types';
import { renderBookFrame } from '../components/book-frame';
import { renderReaderBar } from '../components/reader-bar';
import { el } from '../dom';
import { findAnchorTarget } from '../reader/anchors';
import { createPageTurner, type PageTurner } from '../reader/flip/turner';
import { computeBookLayout, GUTTER, sameLayout, type BookLayout } from '../reader/layout';
import { columnsPaginator } from '../reader/paginator/columns';
import type { Paginator } from '../reader/paginator/types';
import { loadFromManifest } from '../reader/source';
import { categoryHash } from '../router';
import { currentTheme, setTheme } from '../state/theme';
import type { Page, ViewContext } from './types';

/**
 * The open book: a slim bar (back, page indicator, theme) above the book itself, which takes all
 * the space left. The book's Markdown is loaded on demand; the cover, title and details live in
 * the cover view, not here.
 */
export function renderReaderView(ctx: ViewContext, book: Book, anchor?: string): Page {
  const { library, assetUrl } = ctx;
  const category = library.getCategory(book.categoryId) ?? library.root;

  let paginator: Paginator | undefined;
  let turner: PageTurner | undefined;
  let rendered: HTMLElement | undefined;
  let currentAnchor = anchor;
  let attempt = 0; // only the latest attempt may touch the page (retries, slow loads, leaving the page)
  let removeKeys: (() => void) | undefined;
  let observer: ResizeObserver | undefined;

  // ---- navigation: everything that moves through the book goes through here ----------------

  const nav = {
    next: () => turner?.turn(1) ?? false,
    prev: () => turner?.turn(-1) ?? false,
    /** Jumps to a page (0-based): no page turn, the spread that holds it is shown. */
    goToPage(page: number) {
      turner?.finish();
      paginator?.goTo(page);
    },
    goToElement(element: Element) {
      turner?.finish();
      paginator?.goToElement(element);
    },
  };

  const bar = renderReaderBar({
    backHref: categoryHash(category),
    backLabel: category.title === '' ? library.title : category.title,
    theme: currentTheme(),
    onTheme(theme) {
      setTheme(theme);
      bar.themes.update(theme);
    },
    onGoToPage: (page) => nav.goToPage(page),
    onPrev: () => void nav.prev(),
    onNext: () => void nav.next(),
  });

  const stage = el('section', {
    class: 'reader-stage',
    'data-testid': 'book-content',
    'aria-label': 'Book content',
    lang: book.meta.language,
  });

  const element = el(
    'main',
    { class: 'reader-page', id: 'main' },
    el('h1', { class: 'sr-only', tabindex: '-1' }, book.title), // the visible title is on the cover
    bar.root,
    stage,
  );

  const release = () => {
    observer?.disconnect();
    observer = undefined;
    turner?.destroy();
    turner = undefined;
    paginator?.destroy();
    paginator = undefined;
    removeKeys?.();
    removeKeys = undefined;
  };

  /** Shows the page that holds the heading (or the first page when there is no anchor). */
  const goToAnchor = (target: string | undefined) => {
    if (!paginator || !rendered) return;
    const heading = target ? findAnchorTarget(rendered, target) : null;
    if (heading) nav.goToElement(heading);
    else if (!target) nav.goToPage(0);
  };

  // ---- loading, errors -----------------------------------------------------------------------

  const showLoading = () => {
    stage.setAttribute('aria-busy', 'true');
    stage.replaceChildren(el('p', { class: 'reader__status', role: 'status' }, 'Loading book…'));
  };

  const showError = (error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    const retry = el('button', { type: 'button', class: 'button' }, 'Try again');
    retry.addEventListener('click', () => void load());
    stage.setAttribute('aria-busy', 'false');
    stage.replaceChildren(
      el(
        'div',
        { class: 'reader__error', role: 'alert' },
        el('p', { class: 'reader__error-title' }, `We could not load “${book.title}”.`),
        el('p', { class: 'reader__error-detail' }, `Check your connection and try again. (${detail})`),
        retry,
      ),
    );
  };

  async function load() {
    const mine = ++attempt;
    rendered = undefined;
    release();
    bar.update({ page: 0, pagesPerView: 1, pageCount: 0 });
    showLoading();
    try {
      const loadSource = ctx.loadSource ?? loadFromManifest;
      // The Markdown renderer (markdown-it + DOMPurify) is only downloaded when a book is opened.
      const [source, { renderMarkdown }] = await Promise.all([loadSource(book), import('../reader/render')]);
      if (mine !== attempt) return;

      const result = renderMarkdown(source, {
        title: book.title,
        bookId: book.id,
        bookPath: book.path,
        findBookByPath: (path) => library.getBookByPath(path),
        assetUrl: (path) => assetUrl(path),
        chapterBreak: book.meta.chapterBreak,
      });
      // Images that fail to load (broken URL, offline…) get a visible placeholder instead.
      result.element.addEventListener(
        'error',
        (event) => {
          if (event.target instanceof HTMLImageElement) replaceBrokenImage(event.target);
        },
        true,
      );

      // Pages never scroll: code and tables wrap instead, so they are not tab stops.
      for (const node of result.element.querySelectorAll('pre, .table-wrap')) node.removeAttribute('tabindex');

      const frame = renderBookFrame(result.element);
      frame.root.style.visibility = 'hidden'; // laid out (so it can be measured) but not shown unpaginated
      stage.replaceChildren(frame.root);

      let layout: BookLayout = computeBookLayout({ width: stage.clientWidth, height: stage.clientHeight });
      frame.applyLayout(layout);

      const created = await (ctx.createPaginator ?? columnsPaginator)(frame.viewport, result.element, {
        pagesPerView: () => layout.pages,
        gap: GUTTER,
        animate: false, // the reader draws its own page turns
      });
      if (mine !== attempt) return created.destroy(); // the user moved on while we were measuring
      paginator = created;
      rendered = result.element;
      turner = createPageTurner({
        paginator: created,
        content: result.element,
        book: frame.root,
        viewport: frame.viewport,
        flipLayer: frame.flipLayer,
        layout: () => layout,
      });

      // A new size may change how many pages fit (open book or single page): the paginator follows
      // the viewport; this only decides the size of the book.
      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(() => {
          const next = computeBookLayout({ width: stage.clientWidth, height: stage.clientHeight });
          if (sameLayout(next, layout)) return;
          turner?.finish();
          const modeChanged = next.pages !== layout.pages;
          layout = next;
          frame.applyLayout(next);
          // Opening or closing the book may leave the window the same size: tell the paginator.
          if (modeChanged) created.refresh();
        });
        observer.observe(stage);
      }

      const show = () => bar.update({ page: created.page, pagesPerView: created.pagesPerView, pageCount: created.pageCount });
      show();
      created.onChange(show);

      frame.root.style.visibility = '';
      stage.setAttribute('aria-busy', 'false');
      if (!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        // The book slides in. (The class is only a hook for the CSS animation: it never stays on.)
        const done = () => frame.root.classList.remove('book--entering');
        frame.root.classList.add('book--entering');
        frame.root.addEventListener('animationend', done, { once: true });
        setTimeout(done, 1000);
      }

      removeKeys = listenForArrowKeys(frame.root, bar, nav);
      goToAnchor(currentAnchor);
    } catch (error) {
      if (mine === attempt) showError(error);
    }
  }

  void load();

  return {
    title: `${book.title} · ${library.title}`,
    element,
    onAnchorChange(next) {
      currentAnchor = next;
      goToAnchor(next); // while loading: applied once the pages are ready
    },
    destroy() {
      attempt++; // any load still in flight must not touch the page
      release();
    },
  };
}

/** ← / → turn pages while the book is on screen (not while typing, nor with modifier keys). */
function listenForArrowKeys(
  book: HTMLElement,
  bar: { indicator: { editing: boolean } },
  nav: { next(): boolean; prev(): boolean },
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    if (!book.isConnected || bar.indicator.editing) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    if (event.key === 'ArrowRight') nav.next();
    else nav.prev();
  };
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}

function replaceBrokenImage(img: HTMLImageElement) {
  const alt = img.getAttribute('alt') ?? '';
  const marker = el('span', { class: 'missing-image', title: `Could not load ${img.getAttribute('src') ?? 'image'}` });
  marker.textContent = alt ? `${alt} (image could not be loaded)` : 'Image could not be loaded';
  img.replaceWith(marker);
}
