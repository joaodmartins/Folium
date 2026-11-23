// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePageNumber, renderPageIndicator, type PageIndicator } from '../../src/components/page-indicator';
import { renderReaderBar } from '../../src/components/reader-bar';

describe('parsePageNumber', () => {
  it('accepts whole numbers from 1 to the last page', () => {
    expect(parsePageNumber('1', 500)).toBe(1);
    expect(parsePageNumber('300', 500)).toBe(300);
    expect(parsePageNumber('500', 500)).toBe(500);
    expect(parsePageNumber('  42  ', 500)).toBe(42);
    expect(parsePageNumber('007', 500)).toBe(7);
  });

  it('refuses everything else', () => {
    for (const text of ['', ' ', '0', '-1', '-0', '501', '99999999999999999999', '2.5', '2,5', '1e2', 'abc', '12a', '0x10', '+3', '٣', 'NaN', 'Infinity']) {
      expect(parsePageNumber(text, 500), JSON.stringify(text)).toBeNull();
    }
  });

  it('the last page depends on the book', () => {
    expect(parsePageNumber('3', 3)).toBe(3);
    expect(parsePageNumber('4', 3)).toBeNull();
    expect(parsePageNumber('1', 0)).toBeNull();
  });
});

describe('page indicator', () => {
  let indicator: PageIndicator;
  let goTo: ReturnType<typeof vi.fn<(page: number) => void>>;
  const root = () => indicator.root;
  const text = () => root().textContent;
  const input = () => root().querySelector<HTMLInputElement>('[data-testid="page-input"]');
  const current = () => root().querySelector<HTMLButtonElement>('[data-testid="page-current"]');
  const press = (key: string) => input()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const type = (value: string) => {
    input()!.value = value;
    input()!.dispatchEvent(new Event('input', { bubbles: true }));
  };

  beforeEach(() => {
    document.body.replaceChildren();
    goTo = vi.fn<(page: number) => void>();
    indicator = renderPageIndicator(goTo);
    document.body.append(indicator.root);
    indicator.update({ page: 252, pagesPerView: 1, pageCount: 500 });
  });

  it('shows the current page and the total', () => {
    expect(text()).toBe('253 / 500');
    expect(current()?.getAttribute('aria-label')).toBe('Page 253 of 500. Go to another page');
  });

  it('shows both pages of an open book, as individual page numbers', () => {
    indicator.update({ page: 252, pagesPerView: 2, pageCount: 500 });
    expect(text()).toBe('253–254 / 500');
    expect(current()?.textContent).toBe('253');
    expect(current()?.getAttribute('aria-label')).toContain('Pages 253 and 254 of 500');
  });

  it('the last view of a book with an odd number of pages shows only its last page', () => {
    indicator.update({ page: 4, pagesPerView: 2, pageCount: 5 });
    expect(text()).toBe('5 / 5');
    indicator.update({ page: 2, pagesPerView: 2, pageCount: 5 });
    expect(text()).toBe('3–4 / 5');
  });

  it('is empty until the book has pages', () => {
    indicator.update({ page: 0, pagesPerView: 1, pageCount: 0 });
    expect(text()).toBe('');
    expect(current()).toBeNull();
  });

  it('clicking the number opens a field with the current page, selected', () => {
    current()!.click();
    expect(indicator.editing).toBe(true);
    expect(input()?.value).toBe('253');
    expect(document.activeElement).toBe(input());
    expect(input()?.selectionStart).toBe(0);
    expect(input()?.selectionEnd).toBe(3);
    expect(input()?.getAttribute('aria-label')).toBe('Go to page (1 to 500)');
    expect(text()).toBe(' / 500'); // the field replaces the number
  });

  it('Enter goes to the typed page (0-based for the reader) and closes the field', () => {
    current()!.click();
    type('300');
    press('Enter');
    expect(goTo).toHaveBeenCalledExactlyOnceWith(299);
    expect(indicator.editing).toBe(false);
    expect(input()).toBeNull();
    expect(current()).not.toBeNull();
    expect(document.activeElement).toBe(current()); // keyboard users keep their place
  });

  it('accepts the first and the last page', () => {
    current()!.click();
    type('1');
    press('Enter');
    current()!.click();
    type('500');
    press('Enter');
    expect(goTo.mock.calls).toEqual([[0], [499]]);
  });

  it('refuses invalid numbers: no navigation, no error, the field stays open and says why', () => {
    for (const bad of ['', '0', '-5', '501', '2.5', 'abc', '12 34']) {
      current()?.click();
      type(bad);
      expect(() => press('Enter')).not.toThrow();
      expect(goTo, bad).not.toHaveBeenCalled();
      expect(indicator.editing, bad).toBe(true);
      expect(input()?.getAttribute('aria-invalid'), bad).toBe('true');
      expect(root().querySelector('[role="alert"]')?.textContent, bad).toBe('Enter a page from 1 to 500');
    }
  });

  it('the message goes away when the reader types again, and a valid number then works', () => {
    current()!.click();
    type('900');
    press('Enter');
    expect(root().querySelector('[role="alert"]')).not.toBeNull();
    type('9');
    expect(root().querySelector('[role="alert"]')).toBeNull();
    expect(input()?.hasAttribute('aria-invalid')).toBe(false);
    press('Enter');
    expect(goTo).toHaveBeenCalledExactlyOnceWith(8);
  });

  it('Escape cancels without going anywhere', () => {
    current()!.click();
    type('400');
    press('Escape');
    expect(goTo).not.toHaveBeenCalled();
    expect(indicator.editing).toBe(false);
    expect(text()).toBe('253 / 500');
    expect(document.activeElement).toBe(current());
  });

  it('tapping away (blur) cancels too', () => {
    current()!.click();
    type('400');
    input()!.dispatchEvent(new FocusEvent('blur'));
    expect(goTo).not.toHaveBeenCalled();
    expect(indicator.editing).toBe(false);
    expect(text()).toBe('253 / 500');
  });

  it('keeps what is being typed if the page changes underneath (e.g. a resize)', () => {
    current()!.click();
    type('77');
    indicator.update({ page: 10, pagesPerView: 2, pageCount: 640 });
    expect(input()?.value).toBe('77');
    expect(input()?.getAttribute('aria-label')).toBe('Go to page (1 to 640)');
    press('Enter');
    expect(goTo).toHaveBeenCalledWith(76);
    expect(text()).toBe('11–12 / 640');
  });

  it('cancelEdit closes the field from outside', () => {
    current()!.click();
    indicator.cancelEdit();
    expect(indicator.editing).toBe(false);
    indicator.cancelEdit(); // and is harmless when nothing is open
  });
});

describe('reader bar', () => {
  function bar() {
    const handlers = { onTheme: vi.fn(), onGoToPage: vi.fn(), onPrev: vi.fn(), onNext: vi.fn() };
    const result = renderReaderBar({ backHref: '#/category/x', backLabel: 'X', theme: 'sepia', ...handlers });
    document.body.replaceChildren(result.root);
    return { result, handlers };
  }

  it('has a back link, previous/next buttons, the page indicator and the theme control', () => {
    const { result } = bar();
    expect(result.root.querySelector('[data-testid="back-link"]')?.getAttribute('href')).toBe('#/category/x');
    expect(result.root.querySelector('[data-testid="back-link"]')?.textContent).toContain('X');
    expect(result.root.querySelector('[data-testid="prev-page"]')).not.toBeNull();
    expect(result.root.querySelector('[data-testid="next-page"]')).not.toBeNull();
    expect(result.root.querySelector('[data-testid="page-indicator"]')).not.toBeNull();
    expect(result.root.querySelectorAll('.swatch')).toHaveLength(3);
  });

  it('does not repeat the book details (title, author, description, category)', () => {
    const { result } = bar();
    expect(result.root.querySelector('h1, h2, .page__lead, .details')).toBeNull();
  });

  it('starts with the buttons disabled and enables them as the pages allow', () => {
    const { result } = bar();
    expect(result.prevButton.disabled).toBe(true);
    expect(result.nextButton.disabled).toBe(true);
    result.update({ page: 0, pagesPerView: 2, pageCount: 10 });
    expect([result.prevButton.disabled, result.nextButton.disabled]).toEqual([true, false]);
    result.update({ page: 4, pagesPerView: 2, pageCount: 10 });
    expect([result.prevButton.disabled, result.nextButton.disabled]).toEqual([false, false]);
    result.update({ page: 8, pagesPerView: 2, pageCount: 10 });
    expect([result.prevButton.disabled, result.nextButton.disabled]).toEqual([false, true]);
    result.update({ page: 4, pagesPerView: 1, pageCount: 5 });
    expect([result.prevButton.disabled, result.nextButton.disabled]).toEqual([false, true]);
  });

  it('with an odd number of pages the last (single) page is the end', () => {
    const { result } = bar();
    result.update({ page: 4, pagesPerView: 2, pageCount: 5 });
    expect(result.nextButton.disabled).toBe(true);
    result.update({ page: 2, pagesPerView: 2, pageCount: 5 });
    expect(result.nextButton.disabled).toBe(false);
  });

  it('announces the pages to screen readers', () => {
    const { result } = bar();
    result.update({ page: 2, pagesPerView: 2, pageCount: 10 });
    expect(result.root.querySelector('[role="status"]')?.textContent).toBe('Pages 3 and 4 of 10');
    result.update({ page: 9, pagesPerView: 1, pageCount: 10 });
    expect(result.root.querySelector('[role="status"]')?.textContent).toBe('Page 10 of 10');
  });

  it('the buttons call the handlers', () => {
    const { result, handlers } = bar();
    result.update({ page: 4, pagesPerView: 2, pageCount: 10 });
    result.prevButton.click();
    result.nextButton.click();
    expect(handlers.onPrev).toHaveBeenCalledTimes(1);
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
  });

  it('theme swatches mark the current theme and report the choice', () => {
    const { result, handlers } = bar();
    const pressed = () => [...result.root.querySelectorAll('.swatch')].map((b) => `${b.getAttribute('data-testid')}:${b.getAttribute('aria-pressed')}`);
    expect(pressed()).toEqual(['theme-light:false', 'theme-dark:false', 'theme-sepia:true']);
    result.root.querySelector<HTMLButtonElement>('[data-testid="theme-dark"]')!.click();
    expect(handlers.onTheme).toHaveBeenCalledExactlyOnceWith('dark');
    result.themes.update('dark');
    expect(pressed()).toEqual(['theme-light:false', 'theme-dark:true', 'theme-sepia:false']);
    for (const b of result.root.querySelectorAll('.swatch')) expect(b.getAttribute('aria-label')).toMatch(/theme$/);
  });
});
