// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderBookView } from '../../src/views/book-view';
import { renderCategoryView } from '../../src/views/category-view';
import { renderLibraryView } from '../../src/views/library-view';
import { renderNotFoundView } from '../../src/views/not-found-view';
import { createLibrary } from '../../src/library';
import { hueFor } from '../../src/components/cover';
import type { LibraryManifest } from '../../tools/vite-plugin-folium/types';
import { scanFixture } from './helpers';

const { manifest } = scanFixture();
const library = createLibrary(manifest);
const noAssets = () => undefined;
const context = { library, assetUrl: noAssets };
const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

describe('LibraryView (home)', () => {
  const { title, element } = renderLibraryView(context);

  it('shows the library title, tagline and book count from the manifest', () => {
    expect(title).toBe('Fixture Library');
    expect(text(element.querySelector('h1'))).toBe('Fixture Library.');
    expect(text(element.querySelector('.hero__tagline'))).toBe('Used by the unit tests');
    expect(text(element.querySelector('.hero__count'))).toBe('9 books');
  });

  it('lists exactly the top-level categories, in manifest order, linking to their routes', () => {
    const cards = [...element.querySelectorAll('[data-testid="category-card"]')];
    expect(cards.map((c) => text(c.querySelector('h3')))).toEqual(['Sample', 'Languages', 'University']);
    expect(cards.map((c) => c.getAttribute('href'))).toEqual([
      '#/category/sample',
      '#/category/languages',
      '#/category/university',
    ]);
  });

  it('shows recursive book counts and subcategory counts', () => {
    const languages = element.querySelectorAll('[data-testid="category-card"]')[1];
    expect(text(languages.querySelector('.card__meta'))).toBe('5 books · 2 subcategories');
    expect(text(languages.querySelector('.card__text'))).toBe('Language courses.');
  });

  it('lists books that sit at the root of the library', () => {
    const books = [...element.querySelectorAll('[data-testid="book-card"]')];
    expect(books.map((b) => b.getAttribute('href'))).toEqual(['#/book/top-level']);
  });

  it('shows an empty state (and no cards) for an empty library', () => {
    const empty: LibraryManifest = {
      config: manifest.config,
      root: { id: '', name: '', path: '', title: 'Empty', categories: [], bookIds: [] },
      books: [],
    };
    const page = renderLibraryView({ library: createLibrary(empty), assetUrl: noAssets });
    expect(page.element.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(page.element.querySelectorAll('.card')).toHaveLength(0);
  });
});

describe('CategoryView', () => {
  it('renders breadcrumbs, title, description, subcategories and books of any category', () => {
    const russian = library.getCategory('languages/russian')!;
    const { title, element } = renderCategoryView(context, russian);
    expect(title).toBe('Russian · Fixture Library');
    expect(text(element.querySelector('h1'))).toBe('Russian');
    expect([...element.querySelectorAll('.breadcrumbs a')].map((a) => text(a))).toEqual(['Fixture Library', 'Languages']);
    expect([...element.querySelectorAll('[data-testid="category-card"] h3')].map((h) => text(h))).toEqual(['A1']);
    expect(element.querySelectorAll('[data-testid="book-card"]')).toHaveLength(0);
  });

  it('lists the books of a leaf category with author and description', () => {
    const a1 = library.getCategory('languages/russian/a1')!;
    const { element } = renderCategoryView(context, a1);
    const cards = [...element.querySelectorAll('[data-testid="book-card"]')];
    expect(cards.map((c) => text(c.querySelector('h3')))).toEqual(['Russian Alphabet', 'Lesson 1', 'Lesson 2', 'Lesson 10']);
    expect(cards.map((c) => c.getAttribute('href'))[0]).toBe('#/book/languages/russian/a1/alphabet');
    expect(text(cards[0].querySelector('.card__meta'))).toBe('Frontmatter Author');
    expect(text(cards[0].querySelector('.card__text'))).toBe('The Cyrillic alphabet.');
    expect(element.querySelectorAll('[data-testid="category-card"]')).toHaveLength(0);
  });

  it('uses the cover image when the asset exists, and a generated cover otherwise', () => {
    const withAssets = {
      library,
      assetUrl: (p?: string) => (p === 'Languages/Russian/A1/cover.jpg' ? '/assets/cover-hash.jpg' : undefined),
    };
    const { element } = renderCategoryView(withAssets, library.getCategory('languages/russian/a1')!);
    const covers = [...element.querySelectorAll('[data-testid="book-card"] .cover')];
    expect(covers[0].querySelector('img')?.getAttribute('src')).toBe('/assets/cover-hash.jpg');
    expect(covers[1].classList.contains('cover--generated')).toBe(true);
    expect(text(covers[1])).toBe('L');
  });

  it('shows an empty state for a category without books', () => {
    const empty = { id: 'x', name: 'x', path: 'x', title: 'Nothing', categories: [], bookIds: [] };
    const { element } = renderCategoryView(context, empty);
    expect(element.querySelector('[data-testid="empty-state"]')).not.toBeNull();
  });
});

describe('BookView (the cover page of a book)', () => {
  it('shows breadcrumbs, title, author, description and category, and a button that starts reading', () => {
    const book = library.getBook('languages/russian/a1/alphabet')!;
    const { title, element } = renderBookView(context, book);
    expect(title).toBe('Russian Alphabet · Fixture Library');
    expect(text(element.querySelector('h1'))).toBe('Russian Alphabet');
    expect(text(element.querySelector('.page__lead'))).toBe('The Cyrillic alphabet.');
    expect([...element.querySelectorAll('.breadcrumbs a')].map((a) => text(a))).toEqual([
      'Fixture Library',
      'Languages',
      'Russian',
      'A1',
    ]);
    expect(text(element.querySelector('.breadcrumbs [aria-current="page"]'))).toBe('Russian Alphabet');
    expect(text(element.querySelector('.cover-view__author'))).toBe('by Frontmatter Author');
    const category = element.querySelector('[data-testid="category-link"]');
    expect(text(category)).toBe('A1');
    expect(category?.getAttribute('href')).toBe('#/category/languages/russian/a1');
    expect(element.querySelector('[data-testid="start-reading"]')?.getAttribute('href')).toBe('#/read/languages/russian/a1/alphabet');
    expect(element.querySelector('[data-testid="book-content"]')).toBeNull(); // the text comes when you start reading
  });

  it('omits author and description when the book has none', () => {
    const book = { ...library.getBook('top-level')!, meta: { ...library.getBook('top-level')!.meta, author: undefined } };
    const { element } = renderBookView(context, book);
    expect(element.querySelector('.page__lead')).toBeNull();
    expect(element.querySelector('.cover-view__author')).toBeNull();
  });

  it('never interprets titles as HTML', () => {
    const book = { ...library.getBook('top-level')!, title: '<img src=x onerror=alert(1)>' };
    const { element } = renderBookView(context, book);
    expect(element.querySelector('h1 img')).toBeNull();
    expect(element.querySelector('.book-cover img')).toBeNull();
    expect(text(element.querySelector('h1'))).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('NotFoundView', () => {
  it('shows the missing address and a link back to the library', () => {
    const { title, element } = renderNotFoundView(context, '#/category/klingon');
    expect(title).toBe('Page not found · Fixture Library');
    expect(text(element.querySelector('h1'))).toBe('Page not found');
    expect(text(element.querySelector('[data-testid="missing-route"]'))).toBe('#/category/klingon');
    expect(element.querySelector('a')?.getAttribute('href')).toBe('#/');
  });
});

describe('generated covers', () => {
  it('are deterministic', () => {
    expect(hueFor('languages/russian')).toBe(hueFor('languages/russian'));
    expect(hueFor('a')).not.toBe(hueFor('b'));
    expect(hueFor('anything')).toBeLessThan(360);
  });
});
