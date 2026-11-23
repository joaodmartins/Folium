import { describe, expect, it } from 'vitest';
import { createLibrary } from '../../src/library';
import { bookHash, categoryHash, hashFor, parseHash, resolveRoute, type Route } from '../../src/router';
import { scanFixture } from './helpers';

const library = createLibrary(scanFixture().manifest);

describe('parseHash', () => {
  it('maps the empty hash, "#" and "#/" to home', () => {
    for (const hash of ['', '#', '#/', '#//']) expect(parseHash(hash)).toEqual({ name: 'home' });
  });

  it('parses category routes at any depth', () => {
    expect(parseHash('#/category/languages')).toEqual({ name: 'category', id: 'languages' });
    expect(parseHash('#/category/languages/russian')).toEqual({ name: 'category', id: 'languages/russian' });
    expect(parseHash('#/category/languages/russian/a1')).toEqual({ name: 'category', id: 'languages/russian/a1' });
  });

  it('parses book routes (the book id contains slashes)', () => {
    expect(parseHash('#/book/languages/russian/a1/alphabet')).toEqual({
      name: 'book',
      id: 'languages/russian/a1/alphabet',
    });
  });

  it('tolerates a trailing slash and ignores a query string', () => {
    expect(parseHash('#/category/languages/')).toEqual({ name: 'category', id: 'languages' });
    expect(parseHash('#/book/top-level?page=2')).toEqual({ name: 'book', id: 'top-level' });
  });

  it('decodes percent-escapes', () => {
    expect(parseHash('#/category/languages/%D1%80%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9')).toEqual({
      name: 'category',
      id: 'languages/русский',
    });
  });

  it('marks unknown or malformed routes as not-found', () => {
    for (const hash of [
      '#/nope',
      '#/category',
      '#/category/',
      '#/book',
      '#/library/languages',
      '#foo',
      '#/category/%E0%A4%A', // malformed escape
      '#/category/../book',
    ]) {
      expect(parseHash(hash), hash).toEqual({ name: 'not-found', hash });
    }
  });
});

describe('hashFor', () => {
  it('round-trips with parseHash', () => {
    const routes: Route[] = [
      { name: 'home' },
      { name: 'category', id: 'university/operating-systems/theory' },
      { name: 'book', id: 'languages/russian/a1/alphabet' },
      { name: 'category', id: 'languages/русский' },
      { name: 'book', id: 'a b/c?d#e' },
    ];
    for (const route of routes) expect(parseHash(hashFor(route))).toEqual(route);
  });

  it('builds readable hashes', () => {
    expect(hashFor({ name: 'home' })).toBe('#/');
    expect(hashFor({ name: 'category', id: 'languages/russian' })).toBe('#/category/languages/russian');
    expect(hashFor({ name: 'book', id: 'languages/russian/a1/alphabet' })).toBe('#/book/languages/russian/a1/alphabet');
  });

  it('builds links from manifest nodes (root category links home)', () => {
    const a1 = library.getCategory('languages/russian/a1')!;
    expect(categoryHash(a1)).toBe('#/category/languages/russian/a1');
    expect(categoryHash(library.root)).toBe('#/');
    expect(bookHash(library.getBook('languages/russian/a1/alphabet')!)).toBe('#/book/languages/russian/a1/alphabet');
  });
});

describe('resolveRoute (against the manifest)', () => {
  it('resolves categories and books by manifest id', () => {
    const category = resolveRoute(parseHash('#/category/languages/russian'), library);
    expect(category).toMatchObject({ name: 'category', category: { id: 'languages/russian', title: 'Russian' } });

    const book = resolveRoute(parseHash('#/book/languages/russian/a1/alphabet'), library);
    expect(book).toMatchObject({ name: 'book', book: { title: 'Russian Alphabet' } });
  });

  it('resolves every category and book of the manifest', () => {
    for (const book of library.books) expect(resolveRoute({ name: 'book', id: book.id }, library).name).toBe('book');
    const visit = (node: typeof library.root) =>
      node.categories.forEach((c) => {
        expect(resolveRoute({ name: 'category', id: c.id }, library).name).toBe('category');
        visit(c);
      });
    visit(library.root);
  });

  it('turns unknown ids into not-found, and does not mix up categories and books', () => {
    expect(resolveRoute(parseHash('#/category/languages/klingon'), library)).toEqual({
      name: 'not-found',
      hash: '#/category/languages/klingon',
    });
    expect(resolveRoute(parseHash('#/book/languages/russian'), library).name).toBe('not-found'); // a category id
    expect(resolveRoute(parseHash('#/category/languages/russian/a1/alphabet'), library).name).toBe('not-found'); // a book id
  });

  it('does not resolve draft books or the hidden root category', () => {
    expect(resolveRoute({ name: 'book', id: 'languages/russian/a1/secret' }, library).name).toBe('not-found');
    expect(resolveRoute({ name: 'category', id: 'languages/drafts-only' }, library).name).toBe('not-found');
    expect(resolveRoute({ name: 'category', id: '' }, library).name).toBe('not-found');
  });
});

describe('heading anchors in book routes', () => {
  it('parses a second "#" as the heading inside the book', () => {
    expect(parseHash('#/book/languages/russian/a1/alphabet#study-tips')).toEqual({
      name: 'book',
      id: 'languages/russian/a1/alphabet',
      anchor: 'study-tips',
    });
    expect(parseHash('#/book/a/b#Visão%20geral')).toEqual({ name: 'book', id: 'a/b', anchor: 'Visão geral' });
  });

  it('has no anchor when the fragment is empty, and ignores anchors on other routes', () => {
    expect(parseHash('#/book/top-level#')).toEqual({ name: 'book', id: 'top-level' });
    expect(parseHash('#/category/languages#x')).toEqual({ name: 'category', id: 'languages' });
    expect(parseHash('#/#x')).toEqual({ name: 'home' });
  });

  it('round-trips anchors and keeps them when resolving', () => {
    const route: Route = { name: 'book', id: 'languages/russian/a1/alphabet', anchor: 'Visão geral & more' };
    expect(parseHash(hashFor(route))).toEqual(route);
    expect(hashFor({ name: 'book', id: 'x', anchor: 'a b' })).toBe('#/book/x#a%20b');
    expect(resolveRoute({ name: 'book', id: 'top-level', anchor: 'x' }, library)).toMatchObject({
      name: 'book',
      anchor: 'x',
      book: { id: 'top-level' },
    });
    expect(resolveRoute({ name: 'book', id: 'nope', anchor: 'x' }, library).name).toBe('not-found');
  });

  it('rejects malformed escapes in the anchor', () => {
    expect(parseHash('#/book/top-level#%E0%A4%A').name).toBe('not-found');
  });
});
