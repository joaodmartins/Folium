// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, renderRoute } from '../../src/app';
import { createLibrary } from '../../src/library';
import type { SourceLoader } from '../../src/reader/source';
import { renderBookView } from '../../src/views/book-view';
import { scanFixture } from './helpers';

const library = createLibrary(scanFixture().manifest);
const alphabet = library.getBook('languages/russian/a1/alphabet')!; // has a cover in its frontmatter
const lesson = library.getBook('languages/russian/a1/lesson-1')!; // has none
const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

describe('book cover', () => {
  it('uses the cover image when the book has one', () => {
    const assetUrl = (path?: string) => (path === 'Languages/Russian/A1/cover.jpg' ? '/assets/cover-123.jpg' : undefined);
    const { element } = renderBookView({ library, assetUrl }, alphabet);
    const image = element.querySelector<HTMLImageElement>('[data-testid="book-cover"] img');
    expect(image?.getAttribute('src')).toBe('/assets/cover-123.jpg');
    expect(image?.getAttribute('alt')).toBe('Cover of Russian Alphabet');
    expect(element.querySelector('.book-cover--printed')).toBeNull();
  });

  it('makes a printed cover from the title and author when there is no image', () => {
    const { element } = renderBookView({ library, assetUrl: () => undefined }, alphabet);
    const cover = element.querySelector('[data-testid="book-cover"]')!;
    expect(cover.classList.contains('book-cover--printed')).toBe(true);
    expect(cover.querySelector('img')).toBeNull();
    expect(text(cover.querySelector('.book-cover__title'))).toBe('Russian Alphabet');
    expect(text(cover.querySelector('.book-cover__author'))).toBe('Frontmatter Author');
  });

  it('a printed cover of a book without author has only the title', () => {
    const noAuthor = { ...lesson, meta: { ...lesson.meta, author: undefined } };
    const { element } = renderBookView({ library, assetUrl: () => undefined }, noAuthor);
    expect(element.querySelector('.book-cover__author')).toBeNull();
    expect(text(element.querySelector('.book-cover__title'))).toBe('Lesson 1');
  });

  it('gives every book its own colour, always the same one', () => {
    const hue = (book: typeof alphabet) =>
      renderBookView({ library, assetUrl: () => undefined }, book).element.querySelector<HTMLElement>('.book-cover')!.style.getPropertyValue('--cover-hue');
    expect(hue(alphabet)).toBe(hue(alphabet));
    expect(hue(alphabet)).not.toBe(hue(lesson));
  });

  it('has a clear way back to the category and the library', () => {
    const { element } = renderBookView({ library, assetUrl: () => undefined }, alphabet);
    const back = element.querySelector('[data-testid="back-link"]');
    expect(text(back)).toBe('‹A1');
    expect(back?.getAttribute('href')).toBe('#/category/languages/russian/a1');
    expect(element.querySelector('.breadcrumbs a[href="#/"]')).not.toBeNull();
  });

  it('a book at the top of the library goes back to the library', () => {
    const { element } = renderBookView({ library, assetUrl: () => undefined }, library.getBook('top-level')!);
    expect(element.querySelector('[data-testid="back-link"]')?.getAttribute('href')).toBe('#/');
  });
});

describe('opening a book', () => {
  let container: HTMLElement;
  let unmount: (() => void) | undefined;
  const go = (hash: string) => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  beforeEach(() => {
    window.scrollTo = (() => {}) as typeof window.scrollTo;
    container = document.createElement('div');
    document.body.append(container);
  });
  afterEach(() => {
    unmount?.();
    unmount = undefined;
    container.remove();
  });

  it('a book is first shown as a cover, without loading its text', () => {
    const loadSource = vi.fn<SourceLoader>(async () => '# text');
    const page = renderRoute('#/book/languages/russian/a1/alphabet', library, () => undefined, loadSource);
    expect(page.element.classList.contains('cover-view')).toBe(true);
    expect(page.element.querySelector('[data-testid="book-cover"]')).not.toBeNull();
    expect(loadSource).not.toHaveBeenCalled();
  });

  it('#/read/… opens the reader, and loads the text', () => {
    const loadSource = vi.fn<SourceLoader>(() => new Promise(() => {}));
    const page = renderRoute('#/read/languages/russian/a1/alphabet', library, () => undefined, loadSource);
    expect(page.element.classList.contains('reader-page')).toBe(true);
    expect(page.element.querySelector('[data-testid="book-cover"]')).toBeNull();
    expect(loadSource).toHaveBeenCalledTimes(1);
  });

  it('a link to a heading (#/book/…#heading) opens the reader, not the cover', () => {
    const page = renderRoute('#/book/languages/russian/a1/alphabet#overview', library, () => undefined, () => new Promise(() => {}));
    expect(page.element.classList.contains('reader-page')).toBe(true);
  });

  it('the reader shows no title, author, description or category: only the bar and the book', async () => {
    const page = renderRoute('#/read/languages/russian/a1/alphabet', library, () => undefined, async () => '# Russian Alphabet\n\ntext');
    expect(page.element.querySelector('.reader-bar')).not.toBeNull();
    expect(page.element.querySelector('.page__lead, .cover-view__author, .cover-view__category, .details, .breadcrumbs')).toBeNull();
    // the title is there for screen readers only
    expect(page.element.querySelector('h1')?.classList.contains('sr-only')).toBe(true);
  });

  it('"Start reading" opens the reader (and the browser can go back to the cover)', async () => {
    window.location.hash = '#/book/languages/russian/a1/alphabet';
    unmount = mountApp(container, library, { assetUrl: () => undefined, loadSource: async () => '# Russian Alphabet\n\ntext' });
    expect(container.querySelector('[data-testid="book-cover"]')).not.toBeNull();

    // (jsdom has no Web Animations, so the click navigates at once, as it does with reduced motion)
    container.querySelector<HTMLAnchorElement>('[data-testid="start-reading"]')!.click();
    await vi.waitFor(() => expect(window.location.hash).toBe('#/read/languages/russian/a1/alphabet'));
    go(window.location.hash);
    expect(container.querySelector('.reader-page')).not.toBeNull();
    expect(container.querySelector('[data-testid="book-cover"]')).toBeNull();

    go('#/book/languages/russian/a1/alphabet'); // back
    expect(container.querySelector('[data-testid="book-cover"]')).not.toBeNull();
    expect(container.querySelector('.reader-page')).toBeNull();
  });

  it('moving between the cover and the reader of the same book rebuilds the page each time', () => {
    window.location.hash = '#/book/languages/russian/a1/alphabet';
    unmount = mountApp(container, library, { assetUrl: () => undefined, loadSource: () => new Promise(() => {}) });
    const cover = container.firstElementChild;
    go('#/read/languages/russian/a1/alphabet');
    expect(container.firstElementChild).not.toBe(cover);
    expect(container.querySelector('.reader-page')).not.toBeNull();
  });
});
