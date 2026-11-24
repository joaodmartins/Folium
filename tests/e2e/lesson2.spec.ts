import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { farFrom, mix, parseColour, pixelAt } from './support/pixels';

// The first real book of the library, read as it is (this file only reads it, it never changes it):
//   Library/University/Operating Systems/Theory/Lesson2.md
// Everything below is about the book as the reader sees it, so it holds if the text of the book is edited:
// no code is lost, no heading is left apart from its text, and the book appears cleanly.

const ROUTE = '/#/read/university/operating-systems/theory/lesson2';
const SOURCE = readFileSync('Library/University/Operating Systems/Theory/Lesson2.md', 'utf8');
const VIEWPORTS = [[1280, 800], [1366, 768], [1024, 768], [1920, 1080], [820, 1180], [390, 844], [844, 390]] as const;

const book = (page: Page) => page.getByTestId('book-sheet');

async function open(page: Page) {
  await page.goto(ROUTE);
  await expect(book(page)).toBeVisible();
  await expect(page.getByTestId('page-indicator')).toHaveText(/^\d+(–\d+)? \/ \d+$/);
  await expect(book(page)).not.toHaveClass(/book--entering/);
}

/** The code of every fenced block of the Markdown, as the book should show it (quote markers removed). */
function fencedBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] | null = null;
  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/^\s*>\s?/, '');
    if (/^\s*```/.test(line)) {
      if (current) blocks.push(current.join('\n'));
      current = current ? null : [];
    } else if (current) current.push(line);
  }
  return blocks;
}

/** The tables of the Markdown: for each, its number of rows (header included) and columns, and the text of its last cell. */
function markdownTables(markdown: string) {
  const tables: { rows: number; columns: number; last: string }[] = [];
  let group: string[] = [];
  const flush = () => {
    if (group.length >= 2) {
      const rows = group.filter((line) => !/^\|[\s:|-]+\|\s*$/.test(line)).map((line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim()));
      tables.push({ rows: rows.length, columns: rows[0].length, last: rows.at(-1)!.at(-1)! });
    }
    group = [];
  };
  for (const line of markdown.split('\n')) (/^\s*\|/.test(line) ? group.push(line) : flush());
  flush();
  return tables;
}
const plain = (text: string) => text.replace(/[`*_\s\\]/g, '');

test.describe('Lesson 2', () => {
  test('every block of code is in the book, complete, on one page, and reachable by scrolling', async ({ page }) => {
    await open(page);
    const expected = fencedBlocks(SOURCE);
    expect(expected.length).toBeGreaterThan(10);

    const shown = await page.locator('.prose pre > code').evaluateAll((codes) =>
      codes.map((code) => {
        const el = code as HTMLElement;
        const pre = el.parentElement!;
        const content = el.closest('.prose') as HTMLElement;
        const left = content.getBoundingClientRect().left;
        const step = parseFloat(content.style.columnWidth) + parseFloat(content.style.columnGap);
        const pages = new Set([...pre.getClientRects()].map((r) => Math.floor((r.left - left + 1) / step)));
        el.scrollTop = el.scrollHeight;
        el.scrollLeft = el.scrollWidth;
        const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
        return { text: (el.textContent ?? '').replace(/\n$/, ''), pages: pages.size, atEnd, fits: pre.getBoundingClientRect().height <= (content.clientHeight + 1) };
      }),
    );
    expect(shown.map((b) => b.text)).toEqual(expected); // nothing lost, nothing added
    for (const [i, block] of shown.entries()) {
      expect(block.pages, `block ${i + 1} is on one page`).toBe(1);
      expect(block.fits, `block ${i + 1} is no taller than a page`).toBe(true);
      expect(block.atEnd, `the end of block ${i + 1} can be reached`).toBe(true);
    }
  });

  test('every table is in the book, whole, on one page, and its last cell can be reached', async ({ page }) => {
    await open(page);
    const expected = markdownTables(SOURCE);
    expect(expected.length).toBeGreaterThan(3);
    const shown = await page.locator('.prose .table-wrap').evaluateAll((wraps) =>
      wraps.map((wrap) => {
        const el = wrap as HTMLElement;
        const table = el.querySelector('table')!;
        const content = el.closest('.prose') as HTMLElement;
        const left = content.getBoundingClientRect().left;
        const step = parseFloat(content.style.columnWidth) + parseFloat(content.style.columnGap);
        const pages = new Set([...el.getClientRects()].map((r) => Math.floor((r.left - left + 1) / step)));
        el.scrollTo(el.scrollWidth, el.scrollHeight);
        const lastCell = table.rows[table.rows.length - 1].cells[table.rows[table.rows.length - 1].cells.length - 1];
        const cell = lastCell.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return {
          rows: table.rows.length,
          columns: table.rows[0].cells.length,
          last: lastCell.textContent ?? '',
          pages: pages.size,
          fits: box.height <= content.clientHeight + 1,
          reachable: cell.right <= box.right + 1 && cell.bottom <= box.bottom + 1,
        };
      }),
    );
    expect(shown.map(({ rows, columns }) => ({ rows, columns }))).toEqual(expected.map(({ rows, columns }) => ({ rows, columns })));
    for (const [i, t] of shown.entries()) {
      expect(plain(t.last), `table ${i + 1}: last cell`).toBe(plain(expected[i].last));
      expect(t.pages, `table ${i + 1} is on one page`).toBe(1);
      expect(t.fits, `table ${i + 1} is no taller than a page`).toBe(true);
      expect(t.reachable, `the last cell of table ${i + 1} can be reached`).toBe(true);
    }
  });

  test('on a phone no table widens the page, and the big ones scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.prose .table-wrap[data-scrolls]').count()).toBeGreaterThan(0);
  });

  for (const [width, height] of VIEWPORTS) {
    test(`at ${width}x${height}: no heading is separated from the text that follows it`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page);
      const bad = await page.evaluate(() => {
        const content = document.querySelector<HTMLElement>('.prose')!;
        const left = content.getBoundingClientRect().left;
        const step = parseFloat(content.style.columnWidth) + parseFloat(content.style.columnGap);
        const pageAt = (x: number) => Math.floor((x - left + 1) / step);
        const out: string[] = [];
        for (const heading of content.querySelectorAll('h1, h2, h3, h4')) {
          const next = heading.nextElementSibling;
          const a = heading.getClientRects()[0];
          const b = next?.getClientRects()[0];
          if (a && b && pageAt(a.left) !== pageAt(b.left)) out.push(`${heading.textContent} (page ${pageAt(a.left) + 1}) → ${next!.tagName} (page ${pageAt(b.left) + 1})`);
        }
        return out;
      });
      expect(bad).toEqual([]);
    });
  }

  test('the table of contents still leads to every heading, which is shown with its text', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Table of contents', exact: true }).click();
    const entries = page.getByTestId('toc-item');
    const count = await entries.count();
    expect(count).toBeGreaterThan(20);
    for (const index of [count - 1, 7, 0, Math.floor(count / 2), 30]) {
      if (index >= count) continue;
      const label = ((await entries.nth(index).textContent()) ?? '').trim();
      await entries.nth(index).click();
      if (await page.getByRole('dialog', { name: 'Contents' }).isVisible()) await page.keyboard.press('Escape');
      const visible = await page.evaluate((text) => {
        const view = document.querySelector('.book__clip')!.getBoundingClientRect();
        return [...document.querySelectorAll('.prose h1, .prose h2, .prose h3')].some((h) => {
          if (!(h.textContent ?? '').includes(text)) return false;
          const r = h.getBoundingClientRect();
          return r.right > view.left && r.left < view.right;
        });
      }, label.replace(/^\d+(\.\d+)*\.?\s*/, '').slice(0, 14));
      expect(visible, `"${label}" is on screen`).toBe(true);
      await page.getByRole('button', { name: 'Table of contents', exact: true }).click();
    }
  });

  for (const theme of ['light', 'dark', 'sepia'] as const) {
    test(`${theme}: the book appears as paper, never as the brown of the cover`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('folium:theme', t), theme);
      await page.addInitScript(() => {
        const watch = new MutationObserver(() => {
          const el = document.querySelector('.book--entering');
          const animation = el?.getAnimations()[0];
          const w = window as unknown as { __frozen?: boolean };
          if (!el || !animation || w.__frozen) return;
          animation.pause();
          animation.currentTime = 260;
          w.__frozen = true;
        });
        watch.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
      });
      await page.goto(ROUTE);
      await page.waitForFunction(() => (window as unknown as { __frozen?: boolean }).__frozen === true);
      const sample = await book(page).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const css = getComputedStyle(document.documentElement);
        return { x: r.right - 9, y: r.top + r.height / 2, opacity: Number(getComputedStyle(el).opacity), paper: css.getPropertyValue('--page-bg'), desk: css.getPropertyValue('--desk') };
      });
      const seen = await pixelAt(page, sample.x, sample.y);
      const expected = mix(parseColour(sample.paper), parseColour(sample.desk), sample.opacity);
      expect(farFrom(seen, expected), `saw ${seen}, wanted about ${expected.map(Math.round)}`).toBeLessThanOrEqual(8);
    });
  }

  test('page turns and the saved reading position still work', async ({ page }) => {
    await open(page);
    const total = Number((((await page.getByTestId('page-indicator').textContent()) ?? '').split('/')[1] ?? '0').trim());
    expect(total).toBeGreaterThan(30);
    for (let i = 0; i < 12; i++) {
      await page.getByTestId('next-page').click();
      await expect(book(page)).not.toHaveAttribute('data-turning', /.*/);
    }
    const here = ((await page.getByTestId('page-indicator').textContent()) ?? '').trim();
    await page.reload();
    await expect(book(page)).toBeVisible();
    await expect(page.getByTestId('page-indicator')).toHaveText(here); // the progress was saved and restored
  });
});
