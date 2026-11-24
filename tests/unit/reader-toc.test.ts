// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from '../../src/app';
import { createLibrary } from '../../src/library';
import type { Paginator, PaginatorFactory, PageState } from '../../src/reader/paginator/types';
import { loadProgress, saveProgress } from '../../src/state/progress';
import { scanFixture } from './helpers';

// The reader loads its Markdown renderer (markdown-it, highlight.js, KaTeX) on demand. Loading it here, once, keeps the
// first test from paying for a cold start (slow on a fresh install or a CI runner) inside `vi.waitFor`'s default 1 s.
beforeAll(() => import('../../src/reader/render'), 60_000);

const library = createLibrary(scanFixture().manifest);
// Languages/Russian has showTableOfContents: true in its _folder.json; Languages/German does not.
const WITH_TOC = 'languages/russian/a1/alphabet';
const WITHOUT_TOC = 'languages/german/a1/hallo';

const BOOK = '# Russian Alphabet\n\ntext\n\n## One\n\ntext\n\n## Two\n\ntext\n\n### Two A\n\ntext\n\n## Three\n\ntext';


/** A paginator without layout: heading k starts on page `where(k)`, and it knows how to move. */
function fakePages(log: string[], options: { pageCount?: number; view?: 1 | 2; where?: (k: number) => number } = {}): PaginatorFactory {
  const { pageCount = 12, view = 1, where = (k: number) => k * 2 } = options;
  return async (_viewport, content) => {
    let page = 0;
    const listeners = new Set<(state: PageState) => void>();
    const headingsOf = () => [...content.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    const snap = (n: number) => {
      const clamped = Math.min(Math.max(Math.trunc(n) || 0, 0), pageCount - 1);
      return clamped - (clamped % view);
    };
    const move = (n: number) => {
      const next = snap(n);
      if (next !== page) {
        page = next;
        listeners.forEach((l) => l({ page, pageCount }));
      }
    };
    const paginator: Paginator = {
      get page() {
        return page;
      },
      pageCount,
      pagesPerView: view,
      pageSize: { width: 0, height: 0, gap: 0 },
      goTo: (n) => (log.push(`goTo:${n}`), move(n)),
      next: () => false,
      prev: () => false,
      pageOf: (el) => where(Math.max(0, headingsOf().indexOf(el as Element))),
      goToElement: (el) => (log.push(`element:${(el as HTMLElement).id}`), move(paginator.pageOf(el))),
      refresh: () => {},
      onChange: (l) => (listeners.add(l), () => listeners.delete(l)),
      destroy: () => {},
    };
    // the real paginator reports its layout once it has measured: the reader learns the heading pages then
    queueMicrotask(() => {});
    return paginator;
  };
}

describe('table of contents in the reader', () => {
  let container: HTMLElement;
  let unmount: (() => void) | undefined;
  let log: string[];

  const indicator = () => container.querySelector('[data-testid="page-indicator"]')?.textContent;
  const toggle = () => container.querySelector<HTMLButtonElement>('[data-testid="toc-toggle"]')!;
  const panel = () => container.querySelector<HTMLElement>('.toc')!;
  const items = () => [...container.querySelectorAll<HTMLButtonElement>('[data-testid="toc-item"]')];
  const active = () => container.querySelector('[data-testid="toc-item"][aria-current]')?.textContent;
  const key = (name: string, target: EventTarget = document.body) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  const next = () => container.querySelector<HTMLButtonElement>('[data-testid="next-page"]')!.click();

  async function open(id = WITH_TOC, options: { source?: string; hash?: string; pages?: Parameters<typeof fakePages>[1] } = {}) {
    window.location.hash = options.hash ?? `#/read/${id}`;
    await new Promise((resolve) => setTimeout(resolve, 0)); // (jsdom reports a hash change a moment later: not to the app that mounts next)
    unmount = mountApp(container, library, {
      assetUrl: () => undefined,
      loadSource: async () => options.source ?? BOOK,
      createPaginator: fakePages(log, options.pages),
    });
    await vi.waitFor(() => expect(indicator()).toBeTruthy());
    log.length = 0;
  }

  beforeEach(() => {
    window.scrollTo = (() => {}) as typeof window.scrollTo;
    container = document.createElement('div');
    document.body.append(container);
    log = [];
  });
  afterEach(() => {
    unmount?.();
    unmount = undefined;
    container.remove();
    vi.restoreAllMocks();
  });

  describe('the Contents button', () => {
    it('is there when the book asks for a table of contents and has headings', async () => {
      await open();
      expect(toggle().hidden).toBe(false);
      expect(toggle().getAttribute('aria-label')).toBe('Table of contents');
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(toggle().getAttribute('aria-haspopup')).toBe('dialog');
      expect(panel()).not.toBeNull();
      expect(panel().hidden).toBe(true);
    });

    it('is not there (and neither is the panel) when showTableOfContents is off', async () => {
      await open(WITHOUT_TOC);
      expect(toggle().hidden).toBe(true);
      expect(container.querySelector('.toc')).toBeNull();
      expect(container.querySelector('[data-testid="toc-panel"]')).toBeNull();
    });

    it('is not there for a book without headings, even when the table of contents is on', async () => {
      await open(WITH_TOC, { source: 'Just text.\n\nMore text.' });
      expect(toggle().hidden).toBe(true);
      expect(container.querySelector('.toc')).toBeNull();
    });

    it('is not there for a book with only deep headings', async () => {
      await open(WITH_TOC, { source: '#### deep\n\ntext' });
      expect(toggle().hidden).toBe(true);
    });

    it('opens and closes the panel, and tells screen readers', async () => {
      await open();
      toggle().click();
      expect(panel().hidden).toBe(false);
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(items().map((i) => i.textContent)).toEqual(['Russian Alphabet', 'One', 'Two', 'Two A', 'Three']);
      toggle().click();
      expect(panel().hidden).toBe(true);
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('makes the book inert while open (focus stays in the panel) and active again after', async () => {
      await open();
      const stage = container.querySelector('[data-testid="book-content"]')!;
      toggle().focus();
      toggle().click();
      expect(stage.hasAttribute('inert')).toBe(true);
      key('Escape');
      expect(stage.hasAttribute('inert')).toBe(false);
      expect(document.activeElement).toBe(toggle());
    });

    it('reads the hierarchy: the entries are nested by level', async () => {
      await open();
      toggle().click();
      expect(items().map((i) => i.dataset.depth)).toEqual(['0', '1', '1', '2', '1']);
    });
  });

  describe('going to a heading', () => {
    it('shows the page that holds it, updates the indicator, closes the panel', async () => {
      await open();
      toggle().click();
      items().find((i) => i.textContent === 'Two A')!.click();
      expect(log).toEqual(['element:two-a']);
      expect(indicator()).toBe('7 / 12'); // page index 6
      expect(panel().hidden).toBe(true);
    });

    it('a heading on the next view is reached with a page turn, not a jump', async () => {
      await open();
      next(); // page 1; "One" starts on page 2, the next view
      log.length = 0;
      toggle().click();
      items().find((i) => i.textContent === 'One')!.click();
      expect(log).toEqual(['goTo:2']); // what a page turn does to the real book
      expect(indicator()).toBe('3 / 12');
    });

    it('a heading on the current page just closes the panel', async () => {
      await open();
      toggle().click();
      items()[0].click(); // the title, page 0: where we are
      expect(indicator()).toBe('1 / 12');
      expect(panel().hidden).toBe(true);
    });

    it('works on the open book (two pages): the view that holds the heading is shown', async () => {
      await open(WITH_TOC, { pages: { view: 2 } });
      toggle().click();
      items().find((i) => i.textContent === 'Two A')!.click();
      expect(indicator()).toBe('7–8 / 12');
      toggle().click();
      items().find((i) => i.textContent === 'Three')!.click(); // page 8: the next view
      expect(log.at(-1)).toBe('goTo:8');
      expect(indicator()).toBe('9–10 / 12');
    });
  });

  describe('the active heading follows the pages', () => {
    it('is the last heading that starts on or before the page', async () => {
      await open();
      const seen: Record<number, string | null | undefined> = {};
      for (let page = 0; page < 9; page++) {
        toggle().click();
        seen[page] = active();
        toggle().click();
        next();
      }
      expect(seen).toEqual({ 0: 'Russian Alphabet', 1: 'Russian Alphabet', 2: 'One', 3: 'One', 4: 'Two', 5: 'Two', 6: 'Two A', 7: 'Two A', 8: 'Three' });
    });

    it('is updated while the panel is open', async () => {
      await open();
      toggle().click();
      expect(active()).toBe('Russian Alphabet');
      const nextButton = container.querySelector<HTMLButtonElement>('[data-testid="next-page"]')!;
      (nextButton as HTMLElement).removeAttribute('disabled');
      for (let i = 0; i < 4; i++) nextButton.click(); // (the book is inert, but the page can still change, e.g. by a resize)
      expect(active()).toBe('Two');
    });

    it('a heading chosen in the panel is the active one, even if another heading starts on the same page', async () => {
      await open(WITH_TOC, { pages: { where: (k) => [0, 3, 3, 3, 8][k] } }); // One, Two and Two A all start on page 3
      toggle().click();
      items().find((i) => i.textContent === 'Two A')!.click();
      toggle().click();
      expect(active()).toBe('Two A');
      toggle().click();
      items().find((i) => i.textContent === 'Two')!.click();
      toggle().click();
      expect(active()).toBe('Two');
      toggle().click();
      next(); // the page changes: the plain rule applies again
      toggle().click();
      expect(active()).toBe('Two A'); // the last heading on or before page 4
    });

    it('a heading opened by an explicit link is the active one', async () => {
      await open(WITH_TOC, { hash: `#/read/${WITH_TOC}#two` });
      toggle().click();
      expect(active()).toBe('Two');
    });

    it('is the title (the first entry) at the start of a book without any earlier heading', async () => {
      await open(WITH_TOC, { source: '## First\n\ntext\n\n## Second', pages: { where: (k) => [3, 6][k] } });
      toggle().click();
      expect(active()).toBeUndefined(); // the first pages come before any heading: nothing is highlighted
    });
  });

  describe('keyboard', () => {
    it('Escape closes the panel; the arrow keys do not turn pages while it is open', async () => {
      await open();
      toggle().click();
      key('ArrowRight');
      key('ArrowRight');
      expect(indicator()).toBe('1 / 12');
      key('Escape', document.activeElement!);
      expect(panel().hidden).toBe(true);
      key('ArrowRight');
      expect(indicator()).toBe('2 / 12'); // and they work again
    });

    it('opening the panel ends a page-number edit', async () => {
      await open();
      container.querySelector<HTMLButtonElement>('[data-testid="page-current"]')!.click();
      expect(container.querySelector('[data-testid="page-input"]')).not.toBeNull();
      toggle().click();
      expect(container.querySelector('[data-testid="page-input"]')).toBeNull();
    });
  });

  describe('saved progress', () => {
    const KEY = `folium:progress:${WITH_TOC}`;
    const stored = () => JSON.parse(localStorage.getItem(KEY)!);

    it('a book that was only opened leaves nothing behind', async () => {
      await open();
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('is saved when the page changes: the heading, how far into it, and the page', async () => {
      await open();
      for (let i = 0; i < 5; i++) next(); // page 5: inside "Two" (pages 4–5)
      expect(stored()).toMatchObject({ heading: 'two', page: 5 });
      expect(stored().fraction).toBeCloseTo(0.5);
      next(); // page 6: "Two A"
      expect(stored()).toMatchObject({ heading: 'two-a', page: 6, fraction: 0 });
    });

    it('is saved separately for every book', async () => {
      await open();
      next();
      next();
      next();
      expect(loadProgress(WITH_TOC)).toMatchObject({ page: 3 });
      expect(loadProgress('languages/russian/a1/lesson-1')).toBeNull();
      expect(loadProgress(WITHOUT_TOC)).toBeNull();
      unmount?.();
      await open('languages/russian/a1/lesson-1');
      next();
      expect(loadProgress('languages/russian/a1/lesson-1')).toMatchObject({ page: 1 });
      expect(loadProgress(WITH_TOC)).toMatchObject({ page: 3 }); // untouched
    });

    it('is saved also for books without a table of contents', async () => {
      await open(WITHOUT_TOC);
      next();
      expect(loadProgress(WITHOUT_TOC)).toMatchObject({ page: 1 });
    });

    it('opens the book where the reader stopped', async () => {
      saveProgress(WITH_TOC, { heading: 'two', fraction: 0, page: 4, savedAt: 1 });
      await open();
      expect(indicator()).toBe('5 / 12');
    });

    it('goes by the heading, not by the page: a different page count lands in the same part of the book', async () => {
      saveProgress(WITH_TOC, { heading: 'two', fraction: 0.5, page: 5, savedAt: 1 });
      await open(WITH_TOC, { pages: { pageCount: 24, where: (k) => k * 4 } }); // twice as many pages: "Two" is pages 8–11
      expect(indicator()).toBe('11 / 24'); // halfway through "Two": page index 10
      unmount?.();
      await open(WITH_TOC, { pages: { pageCount: 6, where: (k) => k } }); // fewer pages: "Two" is pages 2–2
      expect(indicator()).toBe('3 / 6');
    });

    it('an explicit heading in the link wins over the saved progress', async () => {
      saveProgress(WITH_TOC, { heading: 'two', fraction: 0, page: 4, savedAt: 1 });
      await open(WITH_TOC, { hash: `#/read/${WITH_TOC}#three` });
      expect(indicator()).toBe('9 / 12');
    });

    it('a link to a heading that does not exist falls back to the saved progress', async () => {
      saveProgress(WITH_TOC, { heading: 'two', fraction: 0, page: 4, savedAt: 1 });
      await open(WITH_TOC, { hash: `#/read/${WITH_TOC}#no-such-heading` });
      expect(indicator()).toBe('5 / 12');
    });

    it('when the saved heading is gone, uses the saved page (kept inside the book)', async () => {
      saveProgress(WITH_TOC, { heading: 'a-chapter-that-was-removed', fraction: 0.4, page: 7, savedAt: 1 });
      await open();
      expect(indicator()).toBe('8 / 12');
      unmount?.();
      saveProgress(WITH_TOC, { heading: 'a-chapter-that-was-removed', fraction: 0.4, page: 99, savedAt: 1 });
      await open();
      expect(indicator()).toBe('12 / 12');
    });

    it('without saved progress the book opens on its first page', async () => {
      await open();
      expect(indicator()).toBe('1 / 12');
      expect(log).toEqual([]);
    });

    it('corrupt saved progress is ignored', async () => {
      localStorage.setItem(KEY, '{"heading": 12, nope');
      await open();
      expect(indicator()).toBe('1 / 12');
      next();
      expect(stored().page).toBe(1); // and it is replaced by a good one
    });

    it('the reader works when localStorage fails: it opens, turns pages, and nothing is thrown', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
      await open();
      expect(indicator()).toBe('1 / 12');
      expect(() => {
        next();
        next();
      }).not.toThrow();
      expect(indicator()).toBe('3 / 12');
      toggle().click();
      items().find((i) => i.textContent === 'Three')!.click();
      expect(indicator()).toBe('9 / 12');
    });

    it('works when localStorage cannot even be reached', async () => {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      await open();
      next();
      expect(indicator()).toBe('2 / 12');
    });

    it('moving back to the first page is remembered too', async () => {
      await open();
      next();
      next();
      expect(stored().page).toBe(2);
      const prev = container.querySelector<HTMLButtonElement>('[data-testid="prev-page"]')!;
      prev.click();
      prev.click();
      // (the fake paginator turns pages with goTo)
      expect(indicator()).toBe('1 / 12');
      expect(stored().page).toBe(0);
    });
  });
});
