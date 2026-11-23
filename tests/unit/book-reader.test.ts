// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from '../../src/app';
import { createLibrary } from '../../src/library';
import type { SourceLoader } from '../../src/reader/source';
import { renderRoute } from '../../src/app';
import { renderBookView } from '../../src/views/book-view';
import { renderCategoryView } from '../../src/views/category-view';
import { renderLibraryView } from '../../src/views/library-view';
import type { Book } from '../../tools/vite-plugin-folium/types';
import { scanFixture } from './helpers';

const library = createLibrary(scanFixture().manifest);
const noAssets = () => undefined;
const alphabet = library.getBook('languages/russian/a1/alphabet')!;
const lesson1 = library.getBook('languages/russian/a1/lesson-1')!;

const content = (page: { element: HTMLElement }) => page.element.querySelector<HTMLElement>('[data-testid="book-content"]')!;
const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

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
    await vi.waitFor(() => expect(content(page).querySelector('.prose')).not.toBeNull());

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
    await vi.waitFor(() => expect(content(page).querySelector('.prose')).not.toBeNull());

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
    await vi.waitFor(() => expect(content(page).querySelector('.prose')).not.toBeNull());
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
    await vi.waitFor(() => expect(content(page).querySelector('img')).not.toBeNull());
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
    renderRoute('#/book/languages/russian/a1/alphabet', library, noAssets, loadSource);
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

    go('#/book/languages/russian/a1/alphabet');
    unmount = mountApp(container, library, { assetUrl: noAssets, loadSource });
    expect(container.querySelector('h1')?.textContent).toBe('Russian Alphabet');

    go('#/book/languages/russian/a1/lesson-1');
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
    go('#/book/languages/russian/a1/alphabet');
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

    go('#/book/languages/russian/a1/alphabet');
    unmount = mountApp(container, lib, { assetUrl: noAssets }); // default loader: book.load(), cached
    await vi.waitFor(() => expect(container.querySelector('.prose')).not.toBeNull());
    go('#/');
    go('#/book/languages/russian/a1/alphabet');
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

  it('opens a book at the requested heading once its content is ready', async () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id);
    };
    go('#/book/languages/russian/a1/alphabet#study-tips');
    unmount = mountApp(container, library, { assetUrl: noAssets, loadSource: async () => ALPHABET_MD });
    await vi.waitFor(() => expect(scrolled.length).toBeGreaterThan(0));
    expect(new Set(scrolled)).toEqual(new Set(['study-tips'])); // (jsdom also fires its own hashchange, hence "at least once")
  });

  it('moves between headings of the open book without re-rendering it', async () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id);
    };
    const loadSource = vi.fn<SourceLoader>(async () => ALPHABET_MD);
    go('#/book/languages/russian/a1/alphabet');
    unmount = mountApp(container, library, { assetUrl: noAssets, loadSource });
    await vi.waitFor(() => expect(container.querySelector('.prose')).not.toBeNull());
    const prose = container.querySelector('.prose');

    go('#/book/languages/russian/a1/alphabet#overview');
    go('#/book/languages/russian/a1/alphabet#study-tips');

    expect(scrolled).toEqual(['overview', 'study-tips']);
    expect(container.querySelector('.prose')).toBe(prose); // same DOM: not rebuilt
    expect(loadSource).toHaveBeenCalledTimes(1);

    go('#/book/languages/russian/a1/alphabet'); // anchor removed → back to the top
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0);
    expect(container.querySelector('.prose')).toBe(prose);
  });

  it('keeps working for in-book links ("#heading") written in the Markdown', async () => {
    go('#/book/languages/russian/a1/alphabet');
    unmount = mountApp(container, library, {
      assetUrl: noAssets,
      loadSource: async () => '## One\n\n[to two](#two)\n\n## Two\n',
    });
    await vi.waitFor(() => expect(container.querySelector('.prose a')).not.toBeNull());
    expect(container.querySelector('.prose a')?.getAttribute('href')).toBe('#/book/languages/russian/a1/alphabet#two');
    expect(text(container.querySelector('#two'))).toBe('Two');
  });
});
