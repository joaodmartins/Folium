// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from '../../src/app';
import { createLibrary } from '../../src/library';
import type { Paginator, PaginatorFactory, PageState } from '../../src/reader/paginator/types';
import { scanFixture } from './helpers';

const library = createLibrary(scanFixture().manifest);

/** A paginator with a given number of pages and views, which records every request. */
function pagesOf(pageCount: number, pagesPerView: 1 | 2, log: string[]): PaginatorFactory {
  return async () => {
    let page = 0;
    const listeners = new Set<(state: PageState) => void>();
    const snap = (n: number) => {
      const clamped = Math.min(Math.max(Math.trunc(n) || 0, 0), pageCount - 1);
      return clamped - (clamped % pagesPerView);
    };
    const paginator: Paginator = {
      get page() {
        return page;
      },
      pageCount,
      pagesPerView,
      pageSize: { width: 0, height: 0, gap: 0 },
      goTo(n) {
        log.push(`goTo:${n}`);
        const next = snap(n);
        if (next !== page) {
          page = next;
          listeners.forEach((l) => l({ page, pageCount }));
        }
      },
      next: () => false,
      prev: () => false,
      pageOf: () => 0,
      goToElement: () => {},
      refresh: () => {},
      onChange: (l) => (listeners.add(l), () => listeners.delete(l)),
      destroy: () => {},
    };
    return paginator;
  };
}

describe('reader controls', () => {
  let container: HTMLElement;
  let unmount: (() => void) | undefined;
  const indicator = () => container.querySelector('[data-testid="page-indicator"]')?.textContent;
  const button = (id: string) => container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
  const field = () => container.querySelector<HTMLInputElement>('[data-testid="page-input"]');
  const key = (name: string, target: EventTarget = document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));

  async function open(pageCount: number, pagesPerView: 1 | 2, log: string[] = []) {
    window.location.hash = '#/read/languages/russian/a1/alphabet';
    unmount = mountApp(container, library, {
      assetUrl: () => undefined,
      loadSource: async () => '# Russian Alphabet\n\ntext',
      createPaginator: pagesOf(pageCount, pagesPerView, log),
    });
    await vi.waitFor(() => expect(indicator()).toBeTruthy());
    log.length = 0;
  }

  beforeEach(() => {
    window.scrollTo = (() => {}) as typeof window.scrollTo;
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    container = document.createElement('div');
    document.body.append(container);
  });
  afterEach(() => {
    unmount?.();
    unmount = undefined;
    container.remove();
  });

  describe('page indicator', () => {
    it('an open book shows both pages, numbered as individual pages', async () => {
      await open(500, 2);
      expect(indicator()).toBe('1–2 / 500');
    });

    it('a single page shows one number', async () => {
      await open(500, 1);
      expect(indicator()).toBe('1 / 500');
    });

    it('typing a page number goes to the spread that contains it', async () => {
      const log: string[] = [];
      await open(500, 2, log);
      button('page-current').click();
      field()!.value = '300';
      key('Enter', field()!);
      expect(log).toEqual(['goTo:299']);
      expect(indicator()).toBe('299–300 / 500'); // page 300 is the right-hand page of its spread
      expect(field()).toBeNull();
    });

    it('an out-of-range or invalid number goes nowhere and does not break the reader', async () => {
      const log: string[] = [];
      await open(500, 2, log);
      button('page-current').click();
      for (const bad of ['0', '501', 'x', '-3', '2.5', '']) {
        field()!.value = bad;
        expect(() => key('Enter', field()!)).not.toThrow();
        expect(field()?.getAttribute('aria-invalid')).toBe('true'); // still open, says what is expected
      }
      expect(log).toEqual([]);
      key('Escape', field()!);
      expect(field()).toBeNull();
      expect(indicator()).toBe('1–2 / 500');
    });

    it('the arrow keys do not turn pages while a number is being typed', async () => {
      const log: string[] = [];
      await open(500, 1, log);
      button('page-current').click();
      key('ArrowRight', field()!);
      key('ArrowRight');
      expect(log).toEqual([]);
      key('Escape', field()!);
    });

    it('the last page of a book with an odd number of pages can be reached by number', async () => {
      const log: string[] = [];
      await open(5, 2, log);
      button('page-current').click();
      field()!.value = '5';
      key('Enter', field()!);
      expect(log).toEqual(['goTo:4']);
      expect(indicator()).toBe('5 / 5');
      expect(button('next-page').disabled).toBe(true);
    });
  });

  describe('themes', () => {
    it('shows the current theme as pressed, and starts from the library default', async () => {
      await open(10, 1);
      expect(button('theme-light').getAttribute('aria-pressed')).toBe('true');
    });

    it('switches between light, dark and sepia, and remembers the choice', async () => {
      await open(10, 1);
      for (const theme of ['dark', 'sepia', 'light']) {
        button(`theme-${theme}`).click();
        expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
        expect(window.localStorage.getItem('folium:theme')).toBe(theme);
        for (const other of ['light', 'dark', 'sepia']) {
          expect(button(`theme-${other}`).getAttribute('aria-pressed')).toBe(String(other === theme));
        }
      }
    });

    it('changing the theme does not move the reader or change the pages', async () => {
      const log: string[] = [];
      await open(40, 2, log);
      button('next-page').click();
      expect(indicator()).toBe('3–4 / 40');
      button('theme-dark').click();
      button('theme-sepia').click();
      expect(indicator()).toBe('3–4 / 40'); // same pages, same place
      expect(log.filter((l) => l.startsWith('goTo:'))).toEqual(['goTo:2']); // only the page turn itself: nothing asked after
    });
  });
});
