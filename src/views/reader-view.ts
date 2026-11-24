import type { Book } from '../../tools/vite-plugin-folium/types';
import { renderBookFrame } from '../components/book-frame';
import { renderReaderBar } from '../components/reader-bar';
import { renderTocPanel, type TocPanel } from '../components/toc-panel';
import { el } from '../dom';
import { findAnchorTarget } from '../reader/anchors';
import { createPageTurner, type PageTurner } from '../reader/flip/turner';
import { markScrollableFormulas } from '../reader/scrollable-formulas';
import { computeBookLayout, GUTTER, sameLayout, type BookLayout } from '../reader/layout';
import { columnsPaginator } from '../reader/paginator/columns';
import type { Paginator } from '../reader/paginator/types';
import { loadFromManifest } from '../reader/source';
import { buildToc, type TocEntry } from '../reader/toc';
import { categoryHash } from '../router';
import { describePosition, headingAt, loadProgress, resolveRestore, saveProgress, type HeadingStart } from '../state/progress';
import { currentTheme, setTheme } from '../state/theme';
import type { Page, ViewContext } from './types';

/**
 * The open book: a slim bar (back, contents, page indicator, theme) above the book itself, which
 * takes all the space left. The book's Markdown is loaded on demand; the cover, title and details
 * live in the cover view, not here.
 *
 * It also remembers where the reader is (see state/progress.ts) and offers the table of contents
 * (a panel over the book, built from the book's headings).
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
  let panel: TocPanel | undefined;
  /** Every heading of the book and the page it starts on (in reading order): measured after each layout. */
  let headings: { id: string; element: HTMLElement }[] = [];
  let starts: HeadingStart[] = [];
  let tocIds = new Set<string>();
  /** The entry the reader just chose (or an anchor): it stays the active one until the page changes. */
  let pinned: { id: string; page: number } | null = null;
  let remembering = false; // progress is only saved once the book is open and at its starting place

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
    /** From the table of contents: a page turn when the heading is on the next/previous view, else a jump. */
    goToHeading(element: HTMLElement) {
      if (!paginator) return;
      const view = paginator.pagesPerView;
      const target = paginator.pageOf(element);
      const targetStart = target - (target % view);
      if (targetStart === paginator.page + view) nav.next();
      else if (targetStart === paginator.page - view) nav.prev();
      else nav.goToElement(element);
      pinned = { id: element.id, page: paginator.page };
    },
  };

  // ---- where the reader is: active heading and saved progress --------------------------------

  const measureHeadings = () => {
    if (!paginator) return;
    const created = paginator;
    starts = headings.map(({ id, element: heading }) => ({ id, startPage: created.pageOf(heading) }));
  };

  /** The entry of the table of contents for the pages on screen. */
  const activeId = (): string | null => {
    if (!paginator) return null;
    if (pinned && pinned.page === paginator.page) return pinned.id;
    return headingAt(starts.filter((start) => tocIds.has(start.id)), paginator.page)?.id ?? null;
  };

  const saveProgressNow = () => {
    if (!remembering || !paginator) return;
    if (paginator.page === 0 && loadProgress(book.id) === null) return; // a book that was only opened leaves no trace
    saveProgress(book.id, { ...describePosition(starts, paginator.page, paginator.pageCount), savedAt: Date.now() });
  };

  const openPanel = () => {
    if (!panel) return;
    bar.indicator.cancelEdit();
    turner?.finish();
    panel.open(activeId());
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
    onToc: () => (panel?.isOpen ? panel.close() : openPanel()),
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
    panel?.destroy();
    panel?.root.remove();
    panel = undefined;
    bar.showToc(false);
    stage.removeAttribute('inert');
    headings = [];
    starts = [];
    pinned = null;
    remembering = false;
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
    if (heading) {
      nav.goToElement(heading);
      if (heading.id) pinned = { id: heading.id, page: paginator.page };
    } else if (!target) nav.goToPage(0);
  };

  // ---- loading, errors -----------------------------------------------------------------------

  const showLoading = () => {
    stage.setAttribute('aria-busy', 'true');
    stage.replaceChildren(
      el('p', { class: 'reader__status', role: 'status' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Loading book…'),
    );
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
        el(
          'div',
          { class: 'reader__error-actions' },
          retry,
          el('a', { class: 'button button--quiet', href: categoryHash(category) }, `Back to ${category.title === '' ? library.title : category.title}`),
        ),
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
        onLayout: () => {
          markScrollableFormulas(result.element);
          measureHeadings(); // the pages changed: so did the page each heading is on
          panel?.setActive(activeId());
          saveProgressNow();
        },
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

      headings = result.headings.flatMap(({ id }) => {
        const heading = result.element.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
        return heading ? [{ id, element: heading }] : [];
      });
      measureHeadings();

      // The table of contents, when the book asks for it (`showTableOfContents`) and has headings.
      const toc: TocEntry[] = book.meta.showTableOfContents ? buildToc(result.element) : [];
      tocIds = new Set(toc.map((entry) => entry.id));
      if (toc.length > 0) {
        panel = renderTocPanel({
          entries: toc,
          onSelect(entry) {
            const heading = headings.find((h) => h.id === entry.id)?.element;
            if (heading) nav.goToHeading(heading);
          },
          onToggle(open) {
            bar.setTocOpen(open);
            if (open) stage.setAttribute('inert', '');
            else stage.removeAttribute('inert');
          },
        });
        element.append(panel.root);
        bar.showToc(true);
      }

      const show = () => bar.update({ page: created.page, pagesPerView: created.pagesPerView, pageCount: created.pageCount });
      show();
      created.onChange(() => {
        show();
        panel?.setActive(activeId());
        saveProgressNow();
      });

      frame.root.style.visibility = '';
      stage.setAttribute('aria-busy', 'false');
      if (!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        // The book slides in. (The class is only a hook for the CSS animation: it never stays on.)
        const done = () => frame.root.classList.remove('book--entering');
        frame.root.classList.add('book--entering');
        frame.root.addEventListener('animationend', done, { once: true });
        setTimeout(done, 1000);
      }

      removeKeys = listenForArrowKeys(frame.root, bar, nav, () => panel?.isOpen === true);

      // Where to open: a heading in the link, else where the reader stopped last time, else the first page.
      const linked = currentAnchor ? findAnchorTarget(result.element, currentAnchor) : null;
      if (linked) goToAnchor(currentAnchor);
      else {
        const saved = resolveRestore(loadProgress(book.id), starts, created.pageCount);
        if (saved > 0) created.goTo(saved);
      }
      remembering = true;
      saveProgressNow();
    } catch (error) {
      if (mine === attempt) showError(error);
    }
  }

  void load();

  return {
    title: `${book.title} · ${library.title}`,
    element,
    fullscreen: true,
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
  isBlocked: () => boolean = () => false,
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    if (!book.isConnected || bar.indicator.editing || isBlocked()) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    // A wide formula that has the focus scrolls with the arrow keys.
    if (target instanceof HTMLElement && target.closest('.katex-display[tabindex]')) return;
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
