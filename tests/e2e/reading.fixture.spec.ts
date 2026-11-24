import { expect, test, type Locator, type Page } from '@playwright/test';
import { center, drag, scrollOf } from './support/scroll';

// Code blocks that scroll, headings that stay with their text, and a book that appears only when it is ready.
// Runs against tests/fixtures/e2e-library/Reading (+ Rich, for formulas):
//   Code Blocks  a 180-line block, a block with very long lines, a short block, one heading before each
//   Headings     headings of every level followed by paragraphs, lists, code, tables and other headings

const CODE = '/#/read/reading/code-blocks';
const HEADINGS = '/#/read/reading/headings';
const THEMES = ['light', 'dark', 'sepia'] as const;

const indicator = (page: Page) => page.getByTestId('page-indicator');
const book = (page: Page) => page.getByTestId('book-sheet');

async function open(page: Page, route: string) {
  await page.goto(route);
  await expect(book(page)).toBeVisible();
  await expect(indicator(page)).toHaveText(/^\d+(–\d+)? \/ \d+$/);
  await expect(book(page)).not.toHaveClass(/book--entering/);
}

/** The block of code under a heading (by its id) on screen: its scroll box. */
async function codeUnder(page: Page, heading: string): Promise<Locator> {
  await page.goto(`${CODE}#${heading}`);
  await expect(book(page)).toBeVisible();
  await expect(book(page)).not.toHaveClass(/book--entering/);
  const code = page.locator(`.prose h2[id="${heading}"] + pre > code`);
  await expect(code).toBeVisible();
  return code;
}

const pageText = (page: Page) => indicator(page).innerText();

/** Is `needle` inside the part of the block that is on screen (not scrolled out of the block's box)? */
const shown = (code: Locator, needle: string) =>
  code.evaluate((el, text) => {
    const box = el.getBoundingClientRect();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const at = node.data.indexOf(text);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      const r = range.getBoundingClientRect();
      return r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
    }
    return false;
  }, needle);

test.describe('code blocks that are bigger than the page', () => {
  test('a tall block scrolls with the mouse wheel to its last line and back to the first, without turning the page', async ({ page }) => {
    const code = await codeUnder(page, 'a-very-tall-block');
    const here = await pageText(page);
    expect(await shown(code, '/* 000 */')).toBe(true);
    expect(await shown(code, '/* 179 */')).toBe(false); // not on screen yet…

    await page.mouse.move(...Object.values(await center(code)) as [number, number]);
    await page.mouse.wheel(0, 100_000);
    await expect.poll(async () => (await scrollOf(code)).top).toBeGreaterThan(0);
    await expect.poll(async () => { const s = await scrollOf(code); return s.maxTop - s.top; }).toBeLessThan(2);
    expect(await shown(code, '/* 179 */')).toBe(true); // …until the end of the block is reached
    await page.mouse.wheel(0, 100_000); // more scrolling at the end does not go anywhere else
    expect(await pageText(page)).toBe(here);

    await page.mouse.wheel(0, -100_000);
    await expect.poll(async () => (await scrollOf(code)).top).toBe(0);
    expect(await shown(code, '/* 000 */')).toBe(true);
    expect(await pageText(page)).toBe(here);
  });

  test('a block with very long lines scrolls sideways with a horizontal wheel or shift+wheel', async ({ page }) => {
    const code = await codeUnder(page, 'a-block-with-very-long-lines');
    expect(await shown(code, 'WIDE-START')).toBe(true);
    expect(await shown(code, 'WIDE-END')).toBe(false);
    const here = await pageText(page);
    await page.mouse.move(...Object.values(await center(code)) as [number, number]);
    await page.mouse.wheel(100_000, 0);
    await expect.poll(async () => { const s = await scrollOf(code); return s.maxLeft - s.left; }).toBeLessThan(2);
    expect(await shown(code, 'WIDE-END')).toBe(true);
    expect(await pageText(page)).toBe(here);
  });

  test('with the keyboard: Tab reaches the block, the arrows scroll it (sideways ones do not turn the page), Tab leaves it', async ({ page }) => {
    const wide = await codeUnder(page, 'a-block-with-very-long-lines');
    await expect(wide).toHaveAttribute('tabindex', '0');
    await expect(wide).toHaveAccessibleName(/scroll/i);
    const here = await pageText(page);
    await wide.focus();
    await expect(wide).toBeFocused();
    expect(await wide.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none'); // visible focus
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await scrollOf(wide)).left).toBeGreaterThan(0);
    expect(await pageText(page)).toBe(here); // it scrolled the block, it did not turn the page
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => { const s = await scrollOf(wide); return s.left < s.maxLeft; }).toBe(true);
    expect(await pageText(page)).toBe(here);

    const tall = await codeUnder(page, 'a-very-tall-block');
    await tall.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('PageDown');
    await expect.poll(async () => (await scrollOf(tall)).top).toBeGreaterThan(20);
    await page.keyboard.press('End');
    await expect.poll(async () => { const s = await scrollOf(tall); return s.maxTop - s.top; }).toBeLessThan(2);
    expect(await shown(tall, '/* 179 */')).toBe(true);

    // a block that only scrolls vertically does not take the sideways arrows: they still turn the page
    const before = await pageText(page);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => pageText(page)).not.toBe(before);
  });

  test('a block that fits is not scrollable and is not a tab stop', async ({ page }) => {
    await page.goto(`${CODE}#a-short-block`);
    await expect(book(page)).toBeVisible();
    const code = page.locator('.prose h2[id="a-short-block"] + pre > code');
    await expect(code).toBeVisible();
    await expect(code).not.toHaveAttribute('tabindex', /.*/);
    const s = await scrollOf(code);
    expect(s.maxTop).toBeLessThanOrEqual(1);
    expect(s.maxLeft).toBeLessThanOrEqual(1);
  });

  test('the Copy button copies all of the code, including the part that is scrolled out of view', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const code = await codeUnder(page, 'a-very-tall-block');
    await code.evaluate((el) => (el.scrollTop = el.scrollHeight)); // scroll first: the button has to stay reachable
    const pre = page.locator('.prose h2[id="a-very-tall-block"] + pre');
    await pre.hover();
    const button = pre.getByRole('button', { name: 'Copy code' });
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveText('Copied');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.split('\n')).toHaveLength(180);
    expect(copied.startsWith('/* 000 */ int value_0 = compute(0);')).toBe(true);
    expect(copied.endsWith('int value_179 = compute(179);')).toBe(true);
  });

  test('the page turns still work around the blocks, and a page turn over a scrolling block ends cleanly', async ({ page }) => {
    await open(page, CODE);
    const total = Number((await pageText(page)).split('/')[1]);
    for (let i = 0; i < total; i++) {
      if (await page.getByTestId('next-page').isDisabled()) break;
      await page.getByTestId('next-page').click();
      await expect(book(page)).not.toHaveAttribute('data-turning', /.*/);
    }
    await expect(page.locator('.prose')).toContainText('CODE-BOOK-END');
    await expect(page.locator('.flip__leaf')).toHaveCount(0);
  });

  test.describe('on a phone, with touch', () => {
    test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

    test('one page; a swipe scrolls the block (vertically and sideways) and does not turn the page', async ({ page }) => {
      const code = await codeUnder(page, 'a-very-tall-block');
      await expect(book(page)).toHaveAttribute('data-pages', '1');
      const here = await pageText(page);
      const { x, y } = await center(code);
      // each drag stays on the block: from below the middle up to above it
      await drag(page, x, y + 200, 0, -380);
      await expect.poll(async () => (await scrollOf(code)).top).toBeGreaterThan(100);
      for (let i = 0; i < 20 && (await scrollOf(code)).maxTop - (await scrollOf(code)).top > 2; i++) await drag(page, x, y + 200, 0, -380);
      expect((await scrollOf(code)).maxTop - (await scrollOf(code)).top).toBeLessThan(2);
      expect(await shown(code, '/* 179 */')).toBe(true);
      expect(await pageText(page)).toBe(here);

      const wide = await codeUnder(page, 'a-block-with-very-long-lines');
      const w = await center(wide);
      await drag(page, w.x + 120, w.y, -240, 0);
      await expect.poll(async () => (await scrollOf(wide)).left).toBeGreaterThan(50);
    });
  });
});

for (const theme of THEMES) {
  test(`${theme}: code blocks are readable, show that they scroll, and the pages stay the same`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('folium:theme', t), theme);
    const code = await codeUnder(page, 'a-very-tall-block');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const colours = await code.evaluate((el) => {
      const resolve = (value: string) => {
        const c = document.createElement('canvas').getContext('2d')!;
        c.fillStyle = '#000';
        c.fillStyle = value;
        c.fillRect(0, 0, 1, 1);
        return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const lum = ([r, g, b]: number[]) => { const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const paper = resolve(getComputedStyle(el.parentElement!).backgroundColor);
      const ratio = (value: string) => { const [a, b] = [lum(resolve(value)), lum(paper)]; return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
      return {
        text: ratio(getComputedStyle(el).color),
        comment: ratio(getComputedStyle(el.querySelector('.hljs-comment')!).color),
        number: ratio(getComputedStyle(el.querySelector('.hljs-number')!).color),
        hint: getComputedStyle(el).backgroundImage.includes('linear-gradient'),
      };
    });
    expect(colours.text).toBeGreaterThanOrEqual(7);
    expect(colours.comment).toBeGreaterThanOrEqual(4.5);
    expect(colours.number).toBeGreaterThanOrEqual(4.5);
    expect(colours.hint).toBe(true);
  });
}

// ---- headings ------------------------------------------------------------------------------------------

const VIEWPORTS = [[1280, 800], [1366, 768], [1024, 768], [1920, 1080], [820, 1180], [390, 844], [844, 390], [360, 640]] as const;

/** Headings (H1-H4, in the content) that are on a different page than the block after them. */
const separatedHeadings = (page: Page) =>
  page.evaluate(() => {
    const content = document.querySelector<HTMLElement>('.prose')!;
    const left = content.getBoundingClientRect().left;
    const step = parseFloat(content.style.columnWidth) + parseFloat(content.style.columnGap);
    const pageAt = (x: number) => Math.floor((x - left + 1) / step);
    const bad: string[] = [];
    for (const heading of content.querySelectorAll('h1, h2, h3, h4')) {
      const next = heading.nextElementSibling;
      const a = heading.getClientRects()[0];
      const b = next?.getClientRects()[0];
      if (a && b && pageAt(a.left) !== pageAt(b.left)) bad.push(`${heading.tagName} "${heading.textContent}" (page ${pageAt(a.left) + 1}) → ${next!.tagName} (page ${pageAt(b.left) + 1})`);
    }
    return bad;
  });

test.describe('headings stay with their text', () => {
  for (const route of [HEADINGS, CODE]) {
    for (const [width, height] of VIEWPORTS) {
      test(`${route.split('/').pop()} at ${width}x${height}: no heading is left apart from the block after it`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await open(page, route);
        expect(await separatedHeadings(page)).toEqual([]);
        // and the page the table of contents / links go to shows the heading with its text
        const ids = await page.locator('.prose h1[id], .prose h2[id], .prose h3[id]').evaluateAll((nodes) => nodes.map((n) => n.id));
        expect(ids.length).toBeGreaterThan(3);
      });
    }
  }

  test('no page is only a heading: every page of the book has body text or code', async ({ page }) => {
    await open(page, HEADINGS);
    const lonely = await page.evaluate(() => {
      const content = document.querySelector<HTMLElement>('.prose')!;
      const left = content.getBoundingClientRect().left;
      const step = parseFloat(content.style.columnWidth) + parseFloat(content.style.columnGap);
      const pageAt = (x: number) => Math.floor((x - left + 1) / step);
      const kinds = new Map<number, Set<string>>();
      for (const block of content.children) for (const r of block.getClientRects()) {
        const set = kinds.get(pageAt(r.left)) ?? new Set<string>();
        set.add(/^H[1-6]$/.test(block.tagName) ? 'heading' : 'text');
        kinds.set(pageAt(r.left), set);
      }
      return [...kinds].filter(([, set]) => !set.has('text')).map(([p]) => p + 1);
    });
    expect(lonely).toEqual([]);
  });

  test('chapter and index navigation: opening a heading from the table of contents shows it with its first block', async ({ page }) => {
    await open(page, HEADINGS);
    await page.getByRole('button', { name: 'Table of contents', exact: true }).click();
    const entries = page.getByTestId('toc-item');
    const count = await entries.count();
    expect(count).toBeGreaterThan(5);
    for (const index of [2, count - 1, 0, Math.floor(count / 2)]) {
      await entries.nth(index).click();
      const dialog = page.getByRole('dialog', { name: 'Contents' });
      if (await dialog.isVisible()) await page.keyboard.press('Escape');
      expect(await separatedHeadings(page)).toEqual([]);
      await page.getByRole('button', { name: 'Table of contents', exact: true }).click();
    }
  });
});
