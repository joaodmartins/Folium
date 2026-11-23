// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from '../../src/app';
import { createLibrary } from '../../src/library';
import type { SourceLoader } from '../../src/reader/source';
import { renderRoute } from '../../src/app';
import { renderReaderView as renderBookView } from '../../src/views/reader-view';
import { renderCategoryView } from '../../src/views/category-view';
import { renderLibraryView } from '../../src/views/library-view';
import type { Paginator, PaginatorFactory } from '../../src/reader/paginator/types';
import type { Book } from '../../tools/vite-plugin-folium/types';
import { scanFixture } from './helpers';

const library = createLibrary(scanFixture().manifest);
const noAssets = () => undefined;
const alphabet = library.getBook('languages/russian/a1/alphabet')!;
const lesson1 = library.getBook('languages/russian/a1/lesson-1')!;

const content = (page: { element: HTMLElement }) => page.element.querySelector<HTMLElement>('[data-testid="book-content"]')!;
const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

/** The book is on screen: loaded, rendered and paginated. */
const ready = (page: { element: HTMLElement }) =>
  vi.waitFor(() => {
    expect(content(page).getAttribute('aria-busy')).toBe('false');
    expect(content(page).querySelector('.prose')).not.toBeNull();
  });

/** A paginator without layout (jsdom has none) that records what the view asks of it. */
function fakePaginator(log: string[], pageCount = 3): PaginatorFactory {
  return async () => {
    const paginator: Paginator = {
      page: 0,
      pageCount,
      pagesPerView: 1,
      pageSize: { width: 0, height: 0, gap: 0 },
      goTo: (page) => void log.push(`goTo:${page}`),
      next: () => (log.push('next'), true),
      prev: () => (log.push('prev'), true),
      pageOf: () => 0,
      goToElement: (element) => void log.push(`element:${element.id}`),
      refresh: () => {},
      onChange: () => () => {},
      destroy: () => void log.push('destroy'),
    };
    return paginator;
  };
}

/** A source that the test resolves or rejects by hand. */
function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

const ALPHABET_MD = [
  '---',
  'title: Russian Alphabet',
  '---',
  '# Russian Alphabet',
  '',
  'Intro paragraph.',
  '',
  '## Overview',
  '',
  '![Chart](images/chart.png)',
  '',
  '[Next lesson](<Lesson 1.md>)',
  '',
  '```c',
  'int main(void) { return 0; }',
  '```',
  '',
  '## Study tips',
].join('\n');

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
  window.location.hash = '';
});

describe('book content loading', () => {
  it('shows a loading state, then the rendered Markdown', async () => {
    const source = deferred();
    const loadSource = vi.fn<SourceLoader>(() => source.promise);
    const page = renderBookView({ library, assetUrl: noAssets, loadSource }, alphabet);

    expect(content(page).getAttribute('aria-busy')).toBe('true');
    expect(text(content(page).querySelector('[role="status"]'))).toBe('Loading book…');
    expect(content(page).querySelector('.prose')).toBeNull();

    source.resolve(ALPHABET_MD);
    await ready(page);

    expect(content(page).getAttribute('aria-busy')).toBe('false');
    expect(content(page).querySelector('[role="status"]')).toBeNull();
    expect(loadSource).toHaveBeenCalledTimes(1);
    expect(loadSource).toHaveBeenCalledWith(alphabet);
    expect(text(content(page).querySelector('h2'))).toBe('Overview');
    expect(content(page).querySelector('pre code.language-c')?.textContent).toContain('int main');
  });

  it('resolves images and links relative to the book, and hides the duplicated title', async () => {
    const assetUrl = (path?: string) => (path === 'Languages/Russian/A1/images/chart.png' ? '/assets/chart-1.png' : undefined);
    const page = renderBookView({ library, assetUrl, loadSource: async () => ALPHABET_MD }, alphabet);
    await ready(page);

    expect(content(page).querySelector('img')?.getAttribute('src')).toBe('/assets/chart-1.png');
    expect(content(page).querySelector('a')?.getAttribute('href')).toBe('#/book/languages/russian/a1/lesson-1');
    expect(content(page).querySelector('h1')?.hasAttribute('hidden')).toBe(true);
    // The header's title is the only visible <h1> of the page.
    expect([...page.element.querySelectorAll('h1')].filter((h) => !h.hasAttribute('hidden'))).toHaveLength(1);
  });

  it('shows an understandable error with a retry button, and recovers on retry', async () => {
    const loadSource = vi.fn<SourceLoader>().mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue(ALPHABET_MD);
    const page = renderBookView({ library, assetUrl: noAssets, loadSource }, alphabet);

    await vi.waitFor(() => expect(content(page).querySelector('[role="alert"]')).not.toBeNull());
    const alert = content(page).querySelector('[role="alert"]')!;
    expect(text(alert)).toContain('We could not load “Russian Alphabet”.');
    expect(text(alert)).toContain('Failed to fetch');
    expect(content(page).getAttribute('aria-busy')).toBe('false');

    alert.querySelector('button')!.click();
    await ready(page);
    expect(content(page).querySelector('[role="alert"]')).toBeNull();
    expect(loadSource).toHaveBeenCalledTimes(2);
  });

  it('reports a book that has no loader instead of failing silently', async () => {
    const page = renderBookView({ library, assetUrl: noAssets }, alphabet); // fixture books have no load()
    await vi.waitFor(() => expect(content(page).querySelector('[role="alert"]')).not.toBeNull());
    expect(text(content(page))).toContain('has no content loader');
  });

  it('reports content that cannot be rendered', async () => {
    const page = renderBookView({ library, assetUrl: noAssets, loadSource: async () => null as unknown as string }, alphabet);
    await vi.waitFor(() => expect(content(page).querySelector('[role="alert"]')).not.toBeNull());
  });

  it('replaces images that fail to load with a placeholder', async () => {
    const page = renderBookView(
      { library, assetUrl: noAssets, loadSource: async () => '![Remote chart](https://example.com/chart.png)' },
      alphabet,
    );
    await ready(page);
    content(page).querySelector('img')!.dispatchEvent(new Event('error')); // what the browser does on a 404/offline
    expect(content(page).querySelector('img')).toBeNull();
    expect(text(content(page).querySelector('.missing-image'))).toBe('Remote chart (image could not be loaded)');
  });

  it('does not load anything for the home and category pages', () => {
    const loadSource = vi.fn<SourceLoader>(async () => '');
    const context = { library, assetUrl: noAssets, loadSource };
    renderLibraryView(context);
    renderCategoryView(context, library.getCategory('languages/russian/a1')!);
    renderRoute('#/category/languages', library, noAssets, loadSource);
    expect(loadSource).not.toHaveBeenCalled();
  });

  it('loads only the book that is opened', () => {
    const loadSource = vi.fn<SourceLoader>(() => new Promise(() => {}));
    renderRoute('#/read/languages/russian/a1/alphabet', library, noAssets, loadSource);
    expect(loadSource.mock.calls.map(([b]) => b.id)).toEqual(['languages/russian/a1/alphabet']);
  });
});

describe('opening another book while one is loading', () => {
  let container: HTMLElement;
  let unmount: () => void;
  const go = (hash: string) => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });
  afterEach(() => {
    unmount();
    container.remove();
  });

  it('never shows the previous book\'s content, even if its load finishes last', async () => {
    const slow = deferred();
    const fast = deferred();
    const sources = new Map<string, Promise<string>>([
      [alphabet.id, slow.promise],
      [lesson1.id, fast.promise],
    ]);
    const loadSource: SourceLoader = (book: Book) => sources.get(book.id)!;

    go('#/read/languages/russian/a1/alphabet');
    unmount = mountApp(container, library, { assetUrl: noAssets, loadSource });
    expect(container.querySelector('h1')?.textContent).toBe('Russian Alphabet');

    go('#/read/languages/russian/a1/lesson-1');
    expect(container.querySelector('h1')?.textContent).toBe('Lesson 1');

    fast.resolve('# Lesson 1\n\nSecond book text.');
    await vi.waitFor(() => expect(container.textContent).toContain('Second book text.'));

    slow.resolve('# Russian Alphabet\n\nFirst book text.'); // arrives late
    await new Promise((r) => setTimeout(r, 50));

    expect(container.textContent).toContain('Second book text.');
    expect(container.textContent).not.toContain('First book text.');
    expect(container.querySelector('h1')?.textContent).toBe('Lesson 1');
  });

  it('does not show a book\'s content on the home page after leaving it', async () => {
    const slow = deferred();
    go('#/read/languages/russian/a1/alphabet');
    unmount = mountApp(container, library, { assetUrl: noAssets, loadSource: () => slow.promise });
    go('#/');
    slow.resolve('# Russian Alphabet\n\nLate text.');
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).not.toContain('Late text.');
    expect(container.querySelector('.page--home')).not.toBeNull();
  });

  it('loads each book once even when it is opened repeatedly', async () => {
    const load = vi.fn<SourceLoader>(async (b: Book) => `# ${b.title}\n\ntext`);
    const withLoader = { ...alphabet, load: () => load(alphabet) };
    const lib = createLibrary({ ...scanFixture().manifest, books: scanFixture().manifest.books.map((b) => (b.id === alphabet.id ? withLoader : b)) });

    go('#/read/languages/russian/a1/alphabet');
    unmount = mountApp(container, lib, { assetUrl: noAssets }); // default loader: book.load(), cached
    await vi.waitFor(() => expect(container.querySelector('.prose')).not.toBeNull());
    go('#/');
    go('#/read/languages/russian/a1/alphabet');
    await vi.waitFor(() => expect(container.querySelector('.prose')).not.toBeNull());
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('heading anchors', () => {
  let container: HTMLElement;
  let unmount: () => void;
  const go = (hash: string) => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });
  afterEach(() => {
    unmount();
    container.remove();
  });

  it('opens a book at the page of the requested heading once its pages are ready', async () => {
    const log: string[] = [];
    go('#/read/languages/russian/a1/alphabet#study-tips');
    unmount = mountApp(container, library, {
      assetUrl: noAssets,
      loadSource: async () => ALPHABET_MD,
      createPaginator: fakePaginator(log),
    });
    await vi.waitFor(() => expect(log).toContain('element:study-tips'));
    // (jsdom also fires its own hashchange, hence "at least once")
    expect(new Set(log.filter((entry) => entry.startsWith('element:')))).toEqual(new Set(['element:study-tips']));
  });

  it('moves between headings of the open book without re-rendering it', async () => {
    const log: string[] = [];
    const loadSource = vi.fn<SourceLoader>(async () => ALPHABET_MD);
    go('#/read/languages/russian/a1/alphabet');
    unmount = mountApp(container, library, { assetUrl: noAssets, loadSource, createPaginator: fakePaginator(log) });
    await vi.waitFor(() => expect(container.querySelector('[aria-busy="false"] .prose')).not.toBeNull());
    const prose = container.querySelector('.prose');
    await new Promise((r) => setTimeout(r, 20)); // let jsdom's own hashchange settle
    log.length = 0;

    go('#/read/languages/russian/a1/alphabet#overview');
    go('#/read/languages/russian/a1/alphabet#study-tips');
    expect(log.filter((entry) => entry.startsWith('element:'))).toEqual(['element:overview', 'element:study-tips']);
    expect(container.querySelector('.prose')).toBe(prose); // same DOM: not rebuilt
    expect(loadSource).toHaveBeenCalledTimes(1);

    log.length = 0;
    go('#/read/languages/russian/a1/alphabet'); // anchor removed → back to the first page
    expect(log).toContain('goTo:0');
    expect(container.querySelector('.prose')).toBe(prose);
  });

  it('keeps working for in-book links ("#heading") written in the Markdown', async () => {
    go('#/read/languages/russian/a1/alphabet');
    unmount = mountApp(container, library, {
      assetUrl: noAssets,
      loadSource: async () => '## One\n\n[to two](#two)\n\n## Two\n',
    });
    await vi.waitFor(() => expect(container.querySelector('.prose a')).not.toBeNull());
    expect(container.querySelector('.prose a')?.getAttribute('href')).toBe('#/book/languages/russian/a1/alphabet#two');
    expect(text(container.querySelector('#two'))).toBe('Two');
  });
});

describe('pagination controls', () => {
  let container: HTMLElement;
  let unmount: (() => void) | undefined;

  /** Pages the view can turn: remembers its state and tells listeners, like the real paginator. */
  function statefulPaginator(log: string[], pageCount = 4): PaginatorFactory {
    return async () => {
      let page = 0;
      const listeners = new Set<(state: { page: number; pageCount: number }) => void>();
      const go = (target: number) => {
        const next = Math.min(Math.max(target, 0), pageCount - 1);
        if (next === page) return false;
        page = next;
        listeners.forEach((l) => l({ page, pageCount }));
        return true;
      };
      const paginator: Paginator = {
        get page() {
          return page;
        },
        pageCount,
        pagesPerView: 1,
        pageSize: { width: 0, height: 0, gap: 0 },
        goTo: (p) => (log.push(`goTo:${p}`), void go(p)),
        next: () => go(page + 1),
        prev: () => go(page - 1),
        pageOf: () => 0,
        goToElement: () => {},
        refresh: () => {},
        onChange: (l) => (listeners.add(l), () => listeners.delete(l)),
        destroy: () => void log.push('destroy'),
      };
      return paginator;
    };
  }

  const indicator = () => container.querySelector('[data-testid="page-indicator"]')?.textContent;
  const button = (kind: 'prev' | 'next') => container.querySelector<HTMLButtonElement>(`[data-testid="${kind}-page"]`)!;
  const key = (name: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }));

  async function openBook(log: string[], source = ALPHABET_MD) {
    window.location.hash = '#/read/languages/russian/a1/alphabet';
    unmount = mountApp(container, library, {
      assetUrl: noAssets,
      loadSource: async () => source,
      createPaginator: statefulPaginator(log),
    });
    await vi.waitFor(() => expect(indicator()).toBeTruthy());
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });
  afterEach(() => {
    unmount?.();
    unmount = undefined;
    container.remove();
  });

  it('shows the book on a page sheet with the page indicator and navigation buttons', async () => {
    await openBook([]);
    expect(container.querySelector('.book')).not.toBeNull();
    expect(container.querySelector('.book__clip > .prose')).not.toBeNull();
    expect(indicator()).toBe('1 / 4');
    expect(container.querySelector('.pager__current')?.getAttribute('aria-label')).toContain('Page 1 of 4');
    expect(button('prev').disabled).toBe(true); // nothing before the first page
    expect(button('next').disabled).toBe(false);
  });

  it('the buttons turn pages and the indicator and buttons follow', async () => {
    const log: string[] = [];
    await openBook(log);
    log.length = 0; // (opening the book goes to its first page)
    button('next').click();
    button('next').click();
    expect(indicator()).toBe('3 / 4');
    expect(button('prev').disabled).toBe(false);
    button('next').click();
    expect(indicator()).toBe('4 / 4');
    expect(button('next').disabled).toBe(true); // last page
    button('prev').click();
    expect(indicator()).toBe('3 / 4');
    expect(log.filter((l) => l.startsWith('goTo:'))).toEqual(['goTo:1', 'goTo:2', 'goTo:3', 'goTo:2']);
  });

  it('the left and right arrow keys turn pages', async () => {
    const log: string[] = [];
    await openBook(log);
    key('ArrowRight');
    key('ArrowRight');
    expect(indicator()).toBe('3 / 4');
    key('ArrowLeft');
    expect(indicator()).toBe('2 / 4');
    for (let i = 0; i < 6; i++) key('ArrowLeft');
    expect(indicator()).toBe('1 / 4'); // the limits hold
    for (let i = 0; i < 9; i++) key('ArrowRight');
    expect(indicator()).toBe('4 / 4');
  });

  it('arrow keys are left alone with modifiers, while typing, or for other keys', async () => {
    const log: string[] = [];
    await openBook(log);
    log.length = 0;
    key('ArrowRight', { ctrlKey: true });
    key('ArrowRight', { altKey: true });
    key('ArrowRight', { shiftKey: true });
    key('ArrowRight', { metaKey: true });
    key('ArrowDown');
    key('PageDown');
    const input = document.createElement('input');
    document.body.append(input);
    key('ArrowRight', {}, input);
    input.remove();
    expect(log).toEqual([]);
    expect(indicator()).toBe('1 / 4');
  });

  it('prevents the default action of the arrow keys it handles', async () => {
    await openBook([]);
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('releases the paginator and the keyboard shortcuts when the user leaves the book', async () => {
    const log: string[] = [];
    await openBook(log);
    window.location.hash = '#/';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(log).toContain('destroy');
    log.length = 0;
    key('ArrowRight');
    expect(log).toEqual([]); // no handler left behind
  });

  it('destroys a paginator that finishes after the user already left', async () => {
    const log: string[] = [];
    let release!: () => void;
    const slow: PaginatorFactory = async (...args) => {
      await new Promise<void>((resolve) => (release = resolve));
      return statefulPaginator(log)(...args);
    };
    window.location.hash = '#/read/languages/russian/a1/alphabet';
    unmount = mountApp(container, library, { assetUrl: noAssets, loadSource: async () => ALPHABET_MD, createPaginator: slow });
    await vi.waitFor(() => expect(typeof release).toBe('function'));
    window.location.hash = '#/';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    release();
    await vi.waitFor(() => expect(log).toContain('destroy'));
    expect(container.querySelector('.book')).toBeNull(); // and nothing of the book is shown on the home page
  });

  it('shows an error if the book cannot be paginated', async () => {
    window.location.hash = '#/read/languages/russian/a1/alphabet';
    unmount = mountApp(container, library, {
      assetUrl: noAssets,
      loadSource: async () => ALPHABET_MD,
      createPaginator: async () => {
        throw new Error('layout failed');
      },
    });
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(container.textContent).toContain('layout failed');
  });

  it('applies the book\'s chapterBreak to the rendered pages', async () => {
    const twoChapters = '## One\n\ntext\n\n## Two\n\ntext\n\n<!-- pagebreak -->\n\n## Three';
    // "Lesson 1" inherits chapterBreak "h2" from the fixture config; "Alphabet" sets "none".
    window.location.hash = '#/read/languages/russian/a1/lesson-1';
    unmount = mountApp(container, library, { assetUrl: noAssets, loadSource: async () => twoChapters, createPaginator: statefulPaginator([]) });
    await vi.waitFor(() => expect(indicator()).toBeTruthy());
    expect([...container.querySelectorAll('.page-start')].map((e) => e.textContent)).toEqual(['Two', 'Three']);
    unmount();

    window.location.hash = '#/read/languages/russian/a1/alphabet';
    unmount = mountApp(container, library, { assetUrl: noAssets, loadSource: async () => twoChapters, createPaginator: statefulPaginator([]) });
    await vi.waitFor(() => expect(indicator()).toBeTruthy());
    expect([...container.querySelectorAll('.page-start')].map((e) => e.textContent)).toEqual(['Three']); // only the manual break
  });

  it('removes tab stops that only made sense for scrolling code blocks and tables', async () => {
    await openBook([], '```\ncode\n```\n\n| a |\n|---|\n| b |');
    expect(container.querySelector('pre')?.hasAttribute('tabindex')).toBe(false);
    expect(container.querySelector('.table-wrap')?.hasAttribute('tabindex')).toBe(false);
  });
});
