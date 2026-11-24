// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  clearProgress,
  describePosition,
  headingAt,
  loadProgress,
  resolveRestore,
  saveProgress,
  type HeadingStart,
  type Progress,
} from '../../src/state/progress';

function fakeStorage(initial: Record<string, string> = {}): Storage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

const progress = (over: Partial<Progress> = {}): Progress => ({ heading: 'two', fraction: 0.5, page: 7, savedAt: 1700000000000, ...over });

describe('saved progress', () => {
  it('is saved and loaded for each book separately', () => {
    const storage = fakeStorage();
    expect(loadProgress('a/b', storage)).toBeNull();
    expect(saveProgress('a/b', progress({ heading: 'one', page: 3 }), storage)).toBe(true);
    expect(saveProgress('c/d', progress({ heading: 'two', page: 9 }), storage)).toBe(true);
    expect(loadProgress('a/b', storage)).toEqual(progress({ heading: 'one', page: 3 }));
    expect(loadProgress('c/d', storage)).toEqual(progress({ heading: 'two', page: 9 }));
    expect(loadProgress('other', storage)).toBeNull();
    expect([...storage.data.keys()].sort()).toEqual(['folium:progress:a/b', 'folium:progress:c/d']);
  });

  it('a newer position replaces the older one', () => {
    const storage = fakeStorage();
    saveProgress('b', progress({ page: 1 }), storage);
    saveProgress('b', progress({ page: 8 }), storage);
    expect(loadProgress('b', storage)?.page).toBe(8);
    expect(storage.data.size).toBe(1);
  });

  it('can be before the first heading (heading null) and cleared', () => {
    const storage = fakeStorage();
    saveProgress('b', progress({ heading: null, fraction: 0.25 }), storage);
    expect(loadProgress('b', storage)).toMatchObject({ heading: null, fraction: 0.25 });
    clearProgress('b', storage);
    expect(loadProgress('b', storage)).toBeNull();
  });

  it('ignores anything that is not a valid position (corrupt, hand-edited, from another version)', () => {
    const bad = ['', 'not json', '{', 'null', '42', '"text"', '[]', '{}', '{"heading":5,"fraction":0,"page":0}', '{"heading":"a","fraction":2,"page":0}', '{"heading":"a","fraction":-1,"page":0}', '{"heading":"a","fraction":"0.5","page":1}', '{"heading":"a","fraction":0.5,"page":-3}', '{"heading":"a","fraction":0.5,"page":1.5}', '{"heading":"a","fraction":null,"page":1}'];
    for (const raw of bad) {
      expect(loadProgress('b', fakeStorage({ 'folium:progress:b': raw })), JSON.stringify(raw)).toBeNull();
    }
  });

  it('works without storage and when storage throws (private windows, blocked site data)', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(loadProgress('b', broken)).toBeNull();
    expect(saveProgress('b', progress(), broken)).toBe(false);
    expect(() => clearProgress('b', broken)).not.toThrow();
    expect(loadProgress('b', null)).toBeNull();
    expect(saveProgress('b', progress(), null)).toBe(false);
    expect(() => clearProgress('b', null)).not.toThrow();
  });

  it('uses localStorage by default, and survives it being unavailable', () => {
    saveProgress('real', progress({ page: 4 }));
    expect(window.localStorage.getItem('folium:progress:real')).toContain('"page":4');
    expect(loadProgress('real')?.page).toBe(4);
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadProgress('real')).toBeNull();
    expect(saveProgress('real', progress())).toBe(false);
    vi.restoreAllMocks();
  });
});

const starts = (...pairs: [string, number][]): HeadingStart[] => pairs.map(([id, startPage]) => ({ id, startPage }));
const BOOK = starts(['title', 0], ['one', 0], ['two', 4], ['two-a', 6], ['three', 10]);

describe('where the reader is', () => {
  it('the heading is the last one that starts on or before the first visible page', () => {
    expect(headingAt(BOOK, 0)?.id).toBe('one');
    expect(headingAt(BOOK, 3)?.id).toBe('one');
    expect(headingAt(BOOK, 4)?.id).toBe('two');
    expect(headingAt(BOOK, 9)?.id).toBe('two-a');
    expect(headingAt(BOOK, 99)?.id).toBe('three');
    expect(headingAt(starts(['late', 3]), 1)).toBeNull(); // before the first heading
    expect(headingAt([], 5)).toBeNull();
  });

  it('describes a position as heading + how far into its section', () => {
    expect(describePosition(BOOK, 4, 14)).toEqual({ heading: 'two', fraction: 0, page: 4 });
    expect(describePosition(BOOK, 5, 14)).toMatchObject({ heading: 'two', fraction: 0.5 }); // section "two" is pages 4–5
    expect(describePosition(BOOK, 12, 14)).toMatchObject({ heading: 'three', fraction: 0.5 }); // pages 10–13
    expect(describePosition(BOOK, 13, 14).fraction).toBeCloseTo(0.75);
  });

  it('a position before the first heading, or in a book without headings, is relative to the whole stretch', () => {
    expect(describePosition(starts(['late', 6]), 3, 12)).toEqual({ heading: null, fraction: 0.5, page: 3 });
    expect(describePosition([], 5, 10)).toEqual({ heading: null, fraction: 0.5, page: 5 });
    expect(describePosition([], 0, 10)).toMatchObject({ heading: null, fraction: 0 });
  });

  it('the fraction is always below 1 and never negative, even for odd inputs', () => {
    for (const [page, count] of [[0, 1], [5, 5], [9, 10], [3, 2], [0, 0]] as const) {
      const { fraction } = describePosition(BOOK, page, count);
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThan(1);
    }
  });
});

describe('opening a book where the reader stopped', () => {
  it('goes to the heading, preferably: the same heading on a different screen lands in the same section', () => {
    const saved = progress({ heading: 'two', fraction: 0.5, page: 5 });
    expect(resolveRestore(saved, BOOK, 14)).toBe(5); // same layout: back to the page
    // on a smaller screen the book has twice the pages: "two" now starts on 8 and "two-a" on 12
    const small = starts(['title', 0], ['one', 0], ['two', 8], ['two-a', 12], ['three', 20]);
    expect(resolveRestore(saved, small, 28)).toBe(10); // halfway through "two" again
    // on a larger screen with fewer pages
    const large = starts(['title', 0], ['one', 0], ['two', 2], ['two-a', 3], ['three', 5]);
    expect(resolveRestore(saved, large, 7)).toBe(2);
  });

  it('a position at the very start of a heading opens on that heading', () => {
    expect(resolveRestore(progress({ heading: 'three', fraction: 0, page: 10 }), BOOK, 14)).toBe(10);
  });

  it('never leaves the section of the heading, nor the book', () => {
    for (const fraction of [0, 0.3, 0.999, 1]) {
      const page = resolveRestore(progress({ heading: 'two', fraction, page: 0 }), BOOK, 14);
      expect(page).toBeGreaterThanOrEqual(4);
      expect(page).toBeLessThan(6);
    }
    expect(resolveRestore(progress({ heading: 'three', fraction: 0.999, page: 0 }), BOOK, 11)).toBe(10);
  });

  it('when the saved heading no longer exists, uses the saved page, kept inside the book', () => {
    const gone = progress({ heading: 'removed-chapter', fraction: 0.2, page: 7 });
    expect(resolveRestore(gone, BOOK, 14)).toBe(7);
    expect(resolveRestore(gone, BOOK, 5)).toBe(4); // the book got shorter
    expect(resolveRestore(progress({ heading: 'removed', page: 0 }), BOOK, 14)).toBe(0);
  });

  it('a book without headings (or before its first heading) opens at the same fraction of the book', () => {
    expect(resolveRestore(progress({ heading: null, fraction: 0.5, page: 5 }), [], 10)).toBe(5);
    expect(resolveRestore(progress({ heading: null, fraction: 0.5, page: 5 }), [], 20)).toBe(10); // another screen
    expect(resolveRestore(progress({ heading: null, fraction: 0.999, page: 9 }), [], 10)).toBe(9);
    expect(resolveRestore(progress({ heading: null, fraction: 0.5, page: 3 }), starts(['late', 6]), 12)).toBe(3);
  });

  it('with no saved progress, opens on the first page', () => {
    expect(resolveRestore(null, BOOK, 14)).toBe(0);
    expect(resolveRestore(null, [], 0)).toBe(0);
    expect(resolveRestore(progress(), BOOK, 0)).toBe(0);
  });

  it('a one-page book always opens on the page', () => {
    expect(resolveRestore(progress({ heading: 'one', fraction: 0.5, page: 3 }), starts(['one', 0]), 1)).toBe(0);
  });

  it('what is saved is what is restored: every page of a book comes back to itself', () => {
    for (let page = 0; page < 14; page++) {
      const position = describePosition(BOOK, page, 14);
      expect(resolveRestore({ ...position, savedAt: 0 }, BOOK, 14), `page ${page}`).toBe(page);
    }
  });
});
