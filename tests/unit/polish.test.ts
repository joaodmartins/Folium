// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountApp } from '../../src/app';
import { renderBookCover } from '../../src/components/book-cover';
import { renderBookCard } from '../../src/components/book-card';
import { renderCover } from '../../src/components/cover';
import { renderSiteBar } from '../../src/components/site-bar';
import { createLibrary } from '../../src/library';
import { applyTheme, currentTheme } from '../../src/state/theme';
import { renderBookView } from '../../src/views/book-view';
import { renderNotFoundView } from '../../src/views/not-found-view';
import { scanFixture } from './helpers';

const library = createLibrary(scanFixture().manifest);
const noAssets = () => undefined;
const context = { library, assetUrl: noAssets };
const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

describe('site bar', () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.querySelector('meta[name="theme-color"]')?.remove();
  });

  it('offers the three themes and changes the theme when one is chosen', () => {
    applyTheme('light');
    const bar = renderSiteBar();
    document.body.append(bar);
    const swatches = [...bar.querySelectorAll<HTMLButtonElement>('.swatch')];
    expect(swatches.map((b) => b.getAttribute('aria-label'))).toEqual(['Light theme', 'Dark theme', 'Sepia theme']);
    expect(swatches.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);

    swatches[2].click();
    expect(currentTheme()).toBe('sepia');
    expect(window.localStorage.getItem('folium:theme')).toBe('sepia');
    expect(swatches.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    bar.remove();
  });

  it('links home by the library name, only when asked (the home page has its own title)', () => {
    expect(renderSiteBar().querySelector('[data-testid="site-brand"]')).toBeNull();
    const brand = renderSiteBar({ brand: { title: 'My Library', href: '#/' } }).querySelector('[data-testid="site-brand"]');
    expect(text(brand)).toBe('My Library');
    expect(brand?.getAttribute('href')).toBe('#/');
  });

  it('has a skip link that moves focus to the content instead of navigating', () => {
    const main = document.createElement('main');
    main.id = 'main';
    const bar = renderSiteBar();
    document.body.append(bar, main);
    const skip = bar.querySelector<HTMLAnchorElement>('.skip-link')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    skip.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); // a plain "#main" link would be taken for a route
    expect(document.activeElement).toBe(main);
    bar.remove();
    main.remove();
  });

  it('keeps the browser theme colour in step with the theme', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    applyTheme('dark');
    expect(meta.content).toBe('#16151a');
    applyTheme('sepia');
    expect(meta.content).toBe('#efe4cd');
  });
});

describe('site bar in the app', () => {
  let container: HTMLElement;
  let unmount: () => void;
  const go = async (hash: string) => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  beforeEach(() => {
    window.scrollTo = (() => {}) as typeof window.scrollTo;
    window.location.hash = '';
    container = document.createElement('div');
    document.body.append(container);
    unmount = mountApp(container, library, { assetUrl: noAssets });
  });
  afterEach(() => {
    unmount();
    container.remove();
  });

  it('is on every page except the reader, and links home from every page but the home page', async () => {
    expect(container.querySelector('.site-bar')).not.toBeNull();
    expect(container.querySelector('[data-testid="site-brand"]')).toBeNull();

    for (const hash of ['#/category/languages', '#/book/languages/russian/a1/alphabet', '#/nope']) {
      await go(hash);
      expect(container.querySelector('.site-bar'), hash).not.toBeNull();
      expect(container.querySelector('[data-testid="site-brand"]')?.getAttribute('href'), hash).toBe('#/');
    }
    // the site bar comes before the content, which is a single <main>
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.firstElementChild?.classList.contains('site-bar')).toBe(true);

    await go('#/read/languages/russian/a1/alphabet');
    expect(container.querySelector('.site-bar')).toBeNull();
    expect(container.querySelector('.reader-bar')).not.toBeNull();
  });
});

describe('not-found page', () => {
  const links = (hash: string) =>
    [...renderNotFoundView(context, hash).element.querySelectorAll('a')].map((a) => [text(a), a.getAttribute('href')]);
  const lead = (hash: string) => text(renderNotFoundView(context, hash).element.querySelector('.page__lead'));

  it('says what is missing: a book, a category or just an address', () => {
    expect(lead('#/book/languages/nope')).toMatch(/book does not exist/);
    expect(lead('#/read/nope')).toMatch(/book does not exist/);
    expect(lead('#/category/nope')).toMatch(/category does not exist/);
    expect(lead('#/wat')).toBe('There is nothing at this address.');
  });

  it('offers the library and, when there is one, the nearest category that still exists', () => {
    expect(links('#/wat')).toEqual([['Back to Fixture Library', '#/']]);
    expect(links('#/book/languages/russian/a1/gone')).toEqual([
      ['Back to Fixture Library', '#/'],
      ['Browse A1', '#/category/languages/russian/a1'],
    ]);
    expect(links('#/category/languages/russian/nope/deeper')).toEqual([
      ['Back to Fixture Library', '#/'],
      ['Browse Russian', '#/category/languages/russian'],
    ]);
    // a book at the root: its nearest category is the library itself, already offered
    expect(links('#/book/gone')).toEqual([['Back to Fixture Library', '#/']]);
  });
});

describe('covers', () => {
  it('replace a card cover image that fails to load with the generated cover', () => {
    const cover = renderCover('Hello', 'hello', 'missing.png');
    const parent = document.createElement('div');
    parent.append(cover);
    expect(parent.querySelector('img')).not.toBeNull();

    parent.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(parent.querySelector('img')).toBeNull();
    const generated = parent.querySelector('.cover--generated');
    expect(generated?.textContent).toBe('H');
    expect(generated?.getAttribute('aria-hidden')).toBe('true');
  });

  it('book cards keep their structure with a long title and without author or description', () => {
    const book = { ...library.getBook('top-level')!, title: 'x'.repeat(300) };
    book.meta = { ...book.meta, author: undefined, description: undefined };
    const card = renderBookCard(book, noAssets);
    expect(card.querySelector('.card__title')?.textContent).toHaveLength(300);
    expect(card.querySelector('.card__meta')).toBeNull();
    expect(card.querySelector('.card__text')).toBeNull();
    expect(card.querySelectorAll('a')).toHaveLength(1);
  });

  it('the printed cover sizes its title by length, and prints itself when the image fails', () => {
    const book = library.getBook('top-level')!;
    const sized = (title: string) => renderBookCover({ ...book, title }, undefined).getAttribute('data-title-length');
    expect(sized('Short')).toBe('short');
    expect(sized('A title of about forty characters, ok')).toBe('medium');
    expect(sized('x'.repeat(90))).toBe('long');

    const cover = renderBookCover(book, 'missing.png');
    expect(cover.classList.contains('book-cover--image')).toBe(true);
    cover.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(cover.querySelector('img')).toBeNull();
    expect(cover.classList.contains('book-cover--printed')).toBe(true);
    expect(text(cover.querySelector('.book-cover__title'))).toBe(book.title);
  });

  it('the cover page keeps a way back when the breadcrumbs are hidden on small screens', () => {
    const { element } = renderBookView(context, library.getBook('languages/russian/a1/alphabet')!);
    expect(element.querySelector('[data-testid="back-link"]')?.textContent).toContain('A1');
  });
});
