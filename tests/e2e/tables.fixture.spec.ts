import { expect, test, type Locator, type Page } from '@playwright/test';
import { center, drag, scrollOf } from './support/scroll';

// Tables that are bigger than a page scroll inside themselves. Runs against tests/fixtures/e2e-library/Reading/Tables:
//   a small table (2x3), a wide one (12 columns), a tall one (90 rows), a wide and tall one (8 x 60),
//   one with long text in a cell, and one with code and formatting in its cells.

const ROUTE = '/#/read/reading/tables';
const THEMES = ['light', 'dark', 'sepia'] as const;
const book = (page: Page) => page.getByTestId('book-sheet');
const pageText = async (page: Page) => (((await page.getByTestId('page-indicator').textContent()) ?? '').trim());

async function tableUnder(page: Page, heading: string): Promise<Locator> {
  await page.goto(`${ROUTE}#${heading}`);
  await expect(book(page)).toBeVisible();
  await expect(book(page)).not.toHaveClass(/book--entering/);
  const wrap = page.locator(`.prose h2[id="${heading}"] + .table-wrap`);
  await expect(wrap).toBeVisible();
  return wrap;
}

/** Is `needle` (a cell's text) inside the part of the table that is on screen? */
const shown = (wrap: Locator, needle: string) =>
  wrap.evaluate((el, text) => {
    const box = el.getBoundingClientRect();
    const header = el.querySelector('thead')?.getBoundingClientRect();
    const cell = [...el.querySelectorAll('td, th')].find((c) => (c.textContent ?? '').includes(text));
    if (!cell) return false;
    const r = cell.getBoundingClientRect();
    const hiddenByHeader = header !== undefined && cell.tagName === 'TD' && r.top < header.bottom - 1;
    return !hiddenByHeader && r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
  }, needle);

test.describe('tables bigger than the page', () => {
  test('a tall table scrolls with the wheel to its last row and back, the header stays in view, the page does not turn', async ({ page }) => {
    const wrap = await tableUnder(page, 'a-tall-table');
    const here = await pageText(page);
    expect(await shown(wrap, '001')).toBe(true);
    expect(await shown(wrap, 'name 90')).toBe(false);
    const { x, y } = await center(wrap);
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 100_000);
    await expect.poll(async () => { const s = await scrollOf(wrap); return s.maxTop - s.top; }).toBeLessThan(2);
    expect(await shown(wrap, 'name 90')).toBe(true); // the last row
    const header = await wrap.locator('th').first().evaluate((th) => th.getBoundingClientRect().top);
    expect(Math.abs(header - (await wrap.evaluate((el) => el.getBoundingClientRect().top)))).toBeLessThan(2); // still in view
    await page.mouse.wheel(0, 100_000);
    expect(await pageText(page)).toBe(here);
    await page.mouse.wheel(0, -100_000);
    await expect.poll(async () => (await scrollOf(wrap)).top).toBe(0);
    expect(await pageText(page)).toBe(here);
  });

  test('a wide table scrolls sideways to its last column, without widening the page', async ({ page }) => {
    const wrap = await tableUnder(page, 'a-wide-table');
    const here = await pageText(page);
    expect(await shown(wrap, 'r4c12')).toBe(false);
    await page.mouse.move(...(Object.values(await center(wrap)) as [number, number]));
    await page.mouse.wheel(100_000, 0);
    await expect.poll(async () => { const s = await scrollOf(wrap); return s.maxLeft - s.left; }).toBeLessThan(2);
    expect(await shown(wrap, 'r4c12')).toBe(true);
    expect(await pageText(page)).toBe(here);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.book__clip').evaluate((el) => el.scrollLeft)).toBe(0);
  });

  test('a wide and tall table reaches its bottom-right cell', async ({ page }) => {
    const wrap = await tableUnder(page, 'a-wide-and-tall-table');
    await expect(wrap).toHaveAttribute('data-scrolls', 'both');
    await wrap.evaluate((el) => el.scrollTo(el.scrollWidth, el.scrollHeight));
    expect(await shown(wrap, 'R60C08')).toBe(true);
    await wrap.evaluate((el) => el.scrollTo(0, 0));
    expect(await shown(wrap, 'R01C01')).toBe(true);
  });

  test('a table with code and formatting in its cells keeps them, and its last cell can be reached', async ({ page }) => {
    const wrap = await tableUnder(page, 'code-and-formatting-in-cells');
    await expect(wrap.locator('td code').first()).toHaveText('fork()');
    await expect(wrap.locator('td strong').first()).toHaveText('Clones');
    await expect(wrap.locator('td a').first()).toHaveAttribute('href', 'https://example.com');
    await wrap.evaluate((el) => el.scrollTo(el.scrollWidth, el.scrollHeight));
    expect(await shown(wrap, 'LAST-CELL-OF-CODE-TABLE')).toBe(true);
  });

  test('long text in a cell wraps, and the table does not need to scroll sideways for it', async ({ page }) => {
    const wrap = await tableUnder(page, 'long-text-in-cells');
    const s = await scrollOf(wrap);
    expect(s.maxLeft).toBeLessThanOrEqual(1);
    const heights = await wrap.locator('tbody tr').evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().height));
    expect(heights[0]).toBeGreaterThan(heights[1] * 2);
  });

  test('a small table is left alone: no scroll, not a tab stop, the width of the page, nothing capped', async ({ page }) => {
    const wrap = await tableUnder(page, 'a-small-table');
    for (const attribute of ['tabindex', 'role', 'aria-label', 'data-scrolls', 'style']) await expect(wrap).not.toHaveAttribute(attribute, /.*/);
    const s = await scrollOf(wrap);
    expect(s.maxLeft).toBeLessThanOrEqual(1);
    expect(s.maxTop).toBeLessThanOrEqual(1);
    const [table, box] = await Promise.all([wrap.locator('table').boundingBox(), wrap.boundingBox()]);
    expect(Math.abs(table!.width - box!.width)).toBeLessThan(1.5);
    expect(Math.abs(table!.height - box!.height)).toBeLessThan(1.5);
  });

  test('every page turn over the tables ends cleanly, and the last paragraph is reached', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(book(page)).toBeVisible();
    await expect(page.getByTestId('page-indicator')).toHaveText(/\d+ \/ \d+/);
    for (let i = 0; i < 40; i++) {
      if (await page.getByTestId('next-page').isDisabled()) break;
      await page.getByTestId('next-page').click();
      await expect(book(page)).not.toHaveAttribute('data-turning', /.*/);
    }
    await expect(page.locator('.prose')).toContainText('TABLES-BOOK-END');
    await expect(page.locator('.flip__leaf')).toHaveCount(0);
  });
});

test.describe('keyboard and screen readers', () => {
  test('the table is a named, focusable group with a visible focus; sideways arrows scroll it instead of turning the page', async ({ page }) => {
    const wide = await tableUnder(page, 'a-wide-table');
    await expect(wide).toHaveAttribute('tabindex', '0');
    await expect(wide).toHaveAccessibleName('Table, 5 rows by 12 columns: scrolls sideways');
    const here = await pageText(page);
    await wide.focus();
    await expect(wide).toBeFocused();
    expect(await wide.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await scrollOf(wide)).left).toBeGreaterThan(0);
    expect(await pageText(page)).toBe(here);
    await page.keyboard.press('ArrowLeft');
    expect(await pageText(page)).toBe(here);

    const tall = await tableUnder(page, 'a-tall-table');
    await expect(tall).toHaveAccessibleName('Table, 91 rows by 3 columns: scrolls down');
    await tall.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('PageDown');
    await expect.poll(async () => (await scrollOf(tall)).top).toBeGreaterThan(20);
    await page.keyboard.press('End');
    await expect.poll(async () => { const s = await scrollOf(tall); return s.maxTop - s.top; }).toBeLessThan(2);
    expect(await shown(tall, 'name 90')).toBe(true);
    // a table that only scrolls vertically does not take the sideways arrows: they still turn the page
    const before = await pageText(page);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => pageText(page)).not.toBe(before);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

  test('one page; a swipe scrolls the table (down and sideways) and does not turn the page or scroll the document', async ({ page }) => {
    const tall = await tableUnder(page, 'a-tall-table');
    await expect(book(page)).toHaveAttribute('data-pages', '1');
    const here = await pageText(page);
    const { x, y } = await center(tall);
    await drag(page, x, y + 150, 0, -300);
    await expect.poll(async () => (await scrollOf(tall)).top).toBeGreaterThan(80);
    for (let i = 0; i < 40 && (await scrollOf(tall)).maxTop - (await scrollOf(tall)).top > 2; i++) await drag(page, x, y + 150, 0, -300);
    expect(await shown(tall, 'name 90')).toBe(true);
    expect(await pageText(page)).toBe(here);

    const wide = await tableUnder(page, 'a-wide-table');
    const w = await center(wide);
    await drag(page, w.x + 120, w.y, -240, 0);
    await expect.poll(async () => (await scrollOf(wide)).left).toBeGreaterThan(50);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('no table makes the page wider, and every table can be reached to its last cell', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(book(page)).toBeVisible();
    const state = await page.evaluate(() => ({
      docFits: document.documentElement.scrollWidth <= innerWidth,
      wraps: [...document.querySelectorAll<HTMLElement>('.table-wrap')].map((w) => {
        w.scrollTo(w.scrollWidth, w.scrollHeight);
        const last = w.querySelector('tbody tr:last-child td:last-child')!.getBoundingClientRect();
        const box = w.getBoundingClientRect();
        return last.right <= box.right + 1 && last.bottom <= box.bottom + 1;
      }),
    }));
    expect(state.docFits).toBe(true);
    expect(state.wraps).toHaveLength(6);
    expect(state.wraps.every(Boolean)).toBe(true);
  });
});

for (const theme of THEMES) {
  test(`${theme}: the header, text and scroll hints are readable, and the header is opaque`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('folium:theme', t), theme);
    const wrap = await tableUnder(page, 'a-tall-table');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const info = await wrap.evaluate((el) => {
      const resolve = (value: string) => {
        const c = document.createElement('canvas').getContext('2d')!;
        c.fillStyle = '#000';
        c.fillStyle = value;
        c.fillRect(0, 0, 1, 1);
        return [...c.getImageData(0, 0, 1, 1).data];
      };
      const lum = ([r, g, b]: number[]) => { const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a: string, b: string) => { const [x, y] = [lum(resolve(a)), lum(resolve(b))]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const th = getComputedStyle(el.querySelector('th')!);
      const td = getComputedStyle(el.querySelector('td')!);
      const paper = getComputedStyle(document.querySelector('.book__paper')!).backgroundColor;
      return { header: ratio(th.color, th.backgroundColor), opaque: resolve(th.backgroundColor)[3] === 255, body: ratio(td.color, paper), hint: getComputedStyle(el).backgroundImage.includes('linear-gradient'), position: th.position };
    });
    expect(info.header).toBeGreaterThanOrEqual(7);
    expect(info.body).toBeGreaterThanOrEqual(7);
    expect(info.opaque).toBe(true);
    expect(info.hint).toBe(true);
    expect(info.position).toBe('sticky');
  });
}

const VIEWPORTS = [[1280, 800], [1366, 768], [1024, 768], [820, 1180], [390, 844], [844, 390]] as const;
for (const [width, height] of VIEWPORTS) {
  test(`at ${width}x${height}: headings stay with their tables, tables are one page tall at most, and the page does not overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(ROUTE);
    await expect(book(page)).toBeVisible();
    await expect(book(page)).not.toHaveClass(/book--entering/);
    const result = await page.evaluate(() => {
      const content = document.querySelector<HTMLElement>('.prose')!;
      const left = content.getBoundingClientRect().left;
      const step = parseFloat(content.style.columnWidth) + parseFloat(content.style.columnGap);
      const pageAt = (x: number) => Math.floor((x - left + 1) / step);
      const bad: string[] = [];
      for (const heading of content.querySelectorAll('h1, h2, h3')) {
        const next = heading.nextElementSibling;
        const a = heading.getClientRects()[0];
        const b = next?.getClientRects()[0];
        if (a && b && pageAt(a.left) !== pageAt(b.left)) bad.push(`${heading.textContent} → ${next!.className || next!.tagName}`);
      }
      const split = [...content.querySelectorAll('.table-wrap')].filter((w) => new Set([...w.getClientRects()].map((r) => pageAt(r.left))).size !== 1).length;
      const tooTall = [...content.querySelectorAll('.table-wrap')].filter((w) => w.getBoundingClientRect().height > content.clientHeight + 1).length;
      return { bad, split, tooTall, docFits: document.documentElement.scrollWidth <= innerWidth };
    });
    expect(result).toEqual({ bad: [], split: 0, tooTall: 0, docFits: true });
  });
}

test('the table of contents leads to a heading shown together with its table', async ({ page }) => {
  await page.goto(ROUTE);
  await expect(book(page)).toBeVisible();
  await page.getByRole('button', { name: 'Table of contents', exact: true }).click();
  const entries = page.getByTestId('toc-item');
  const count = await entries.count();
  expect(count).toBeGreaterThan(5);
  for (const index of [3, count - 1, 2, 4]) {
    await entries.nth(index).click();
    if (await page.getByRole('dialog', { name: 'Contents' }).isVisible()) await page.keyboard.press('Escape');
    const together = await page.evaluate(() => {
      const view = document.querySelector('.book__clip')!.getBoundingClientRect();
      const onScreen = (el: Element) => [...el.getClientRects()].some((r) => r.right > view.left + 1 && r.left < view.right - 1);
      return [...document.querySelectorAll('.prose h2')].filter((h) => h.nextElementSibling?.classList.contains('table-wrap') && onScreen(h)).every((h) => onScreen(h.nextElementSibling!));
    });
    expect(together).toBe(true);
    await page.getByRole('button', { name: 'Table of contents', exact: true }).click();
  }
});
