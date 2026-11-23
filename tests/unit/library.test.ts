import { describe, expect, it } from 'vitest';
import { createLibrary } from '../../src/library';
import { scanFixture } from './helpers';

const { manifest } = scanFixture();
const library = createLibrary(manifest);

describe('createLibrary', () => {
  it('exposes the site title from the global config', () => {
    expect(library.title).toBe('Fixture Library');
    expect(library.tagline).toBe('Used by the unit tests');
  });

  it('finds categories at every depth by manifest id', () => {
    expect(library.getCategory('languages')?.title).toBe('Languages');
    expect(library.getCategory('languages/russian')?.title).toBe('Russian');
    expect(library.getCategory('languages/russian/a1')?.path).toBe('Languages/Russian/A1');
    expect(library.getCategory('university/operating-systems/theory')?.title).toBe('Theory');
    expect(library.getCategory('languages/nope')).toBeUndefined();
  });

  it('finds books by manifest id', () => {
    expect(library.getBook('languages/russian/a1/alphabet')?.title).toBe('Russian Alphabet');
    expect(library.getBook('top-level')?.category).toBe('');
    expect(library.getBook('languages/russian/a1/secret')).toBeUndefined(); // draft
  });

  it('lists the books directly inside a category, in manifest order', () => {
    const a1 = library.getCategory('languages/russian/a1')!;
    expect(library.booksOf(a1).map((b) => b.title)).toEqual(['Russian Alphabet', 'Lesson 1', 'Lesson 2', 'Lesson 10']);
    expect(library.booksOf(library.root).map((b) => b.id)).toEqual(['top-level']);
    expect(library.booksOf(library.getCategory('languages')!)).toEqual([]);
  });

  it('counts books recursively', () => {
    expect(library.countBooks(library.getCategory('languages/russian/a1')!)).toBe(4);
    expect(library.countBooks(library.getCategory('languages')!)).toBe(5); // 4 Russian + 1 German
    expect(library.countBooks(library.root)).toBe(manifest.books.length);
  });

  it('returns the trail from the root to a category', () => {
    const a1 = library.getCategory('languages/russian/a1')!;
    expect(library.trailTo(a1).map((c) => c.id)).toEqual(['', 'languages', 'languages/russian', 'languages/russian/a1']);
    expect(library.trailTo(library.root)).toEqual([library.root]);
  });
});
