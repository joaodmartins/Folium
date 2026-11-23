import { expect, test, type Locator, type Page } from '@playwright/test';

// Runs against tests/fixtures/e2e-library (see playwright.config.ts), not the real Library/.
// These tests are about turning single pages, so they use a window that is too narrow for the
// open book (two pages): see reader.fixture.spec.ts for the open book.
// Books: Long Book (60 numbered paragraphs, 10 sections), Short Book (1 page), Manual Breaks (4 pages),
// Chapters (chapterBreak h2: 4 pages), Hard Cases (tall/wide images, long code, wide table, long list…).

test.use({ viewport: { width: 700, height: 760 } });

const book = (name: string) => `/#/read/pagination/${name}`;
const LONG = book('long-book');
const SHORT = book('short-book');
const BREAKS = book('manual-breaks');
const CHAPTERS = book('chapters');
const HARD = book('hard-cases');

const indicator = (page: Page) => page.getByTestId('page-indicator');
const next = (page: Page) => page.getByTestId('next-page');
const prev = (page: Page) => page.getByTestId('prev-page');
const clip = (page: Page) => page.locator('.book__clip');

/** "3 / 12" → { current: 3, total: 12 } */
async function pageState(page: Page) {
  const text = (await indicator(page).textContent()) ?? '';
  const [, current, total] = /(\d+)\s*\/\s*(\d+)/.exec(text) ?? [];
  return { current: Number(current), total: Number(total) };
}

async function openBook(page: Page, route: string) {
  await page.goto(route);
  await expect(page.getByTestId('book-sheet')).toBeVisible();
  await expect(indicator(page)).toHaveText(/^\d+ \/ \d+$/);
}

/** True once the element is (even partly) inside the visible page window. */
const onScreen = (element: Locator) =>
  element.first().evaluate((el) => {
    const view = document.querySelector('.book__clip')!.getBoundingClientRect();
    return [...el.getClientRects()].some((r) => r.width > 0 && r.right > view.left + 1 && r.left < view.right - 1);
  });

/** Waits until the page slide has finished (text no longer moving). */
const settled = (page: Page) => page.waitForTimeout(300);

/** Labels ("P23", "Section 5") of the paragraphs and headings that are on the visible page. */
const visibleLabels = (page: Page) =>
  page.evaluate(() => {
    const view = document.querySelector('.book__clip')!.getBoundingClientRect();
    const labels: string[] = [];
    for (const el of document.querySelectorAll('.prose p, .prose h2')) {
      const onPage = [...el.getClientRects()].some((r) => r.width > 0 && r.right > view.left + 1 && r.left < view.right - 1);
      if (onPage) labels.push((el.textContent ?? '').split(' ').slice(0, el.tagName === 'H2' ? 2 : 1).join(' '));
    }
    return labels;
  });

const paragraph = (page: Page, n: number) => page.locator('.prose p', { hasText: new RegExp(`^P${n} `) });

test.describe('a paginated book', () => {
  test('opens as pages: a sheet, a page indicator, and no scrolling of the whole page', async ({ page }) => {
    await openBook(page, LONG);
    const { current, total } = await pageState(page);
    expect(current).toBe(1);
    expect(total).toBeGreaterThan(5);

    await expect(prev(page)).toBeDisabled();
    await expect(next(page)).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    expect(await clip(page).evaluate((el) => getComputedStyle(el).overflow)).toBe('hidden');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Long Book');
  });

  test('shows only the current page', async ({ page }) => {
    await openBook(page, LONG);
    await expect.poll(() => onScreen(paragraph(page, 1))).toBe(true);
    await expect.poll(() => onScreen(paragraph(page, 60))).toBe(false);
    await expect.poll(() => onScreen(paragraph(page, 30))).toBe(false);
  });

  test('goes forward and back with the buttons, and the indicator follows', async ({ page }) => {
    await openBook(page, LONG);
    const { total } = await pageState(page);

    await next(page).click();
    await expect(indicator(page)).toHaveText(`2 / ${total}`);
    await expect(prev(page)).toBeEnabled();
    await expect.poll(() => onScreen(paragraph(page, 1))).toBe(false); // the first page moved away

    await next(page).click();
    await expect(indicator(page)).toHaveText(`3 / ${total}`);
    await prev(page).click();
    await expect(indicator(page)).toHaveText(`2 / ${total}`);
    await prev(page).click();
    await expect(indicator(page)).toHaveText(`1 / ${total}`);
    await expect(prev(page)).toBeDisabled();
    await expect.poll(() => onScreen(paragraph(page, 1))).toBe(true);
  });

  test('stops at the last page, where the last paragraph is on screen', async ({ page }) => {
    await openBook(page, LONG);
    const { total } = await pageState(page);
    for (let i = 1; i < total; i++) await next(page).click();
    await expect(indicator(page)).toHaveText(`${total} / ${total}`);
    await expect(next(page)).toBeDisabled();
    await expect(prev(page)).toBeEnabled();
    await expect.poll(() => onScreen(paragraph(page, 60))).toBe(true);
  });

  test('the left and right arrow keys turn pages', async ({ page }) => {
    await openBook(page, LONG);
    const { total } = await pageState(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(indicator(page)).toHaveText(`3 / ${total}`);
    await page.keyboard.press('ArrowLeft');
    await expect(indicator(page)).toHaveText(`2 / ${total}`);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft'); // already on the first page
    await expect(indicator(page)).toHaveText(`1 / ${total}`);
  });

  test('arrow keys stop working once the reader leaves the book', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openBook(page, LONG);
    await page.getByTestId('back-link').click(); // back to the category
    await expect(page.getByRole('heading', { level: 1, name: 'Pagination' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(indicator(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a one-page book has a disabled previous and next button', async ({ page }) => {
    await openBook(page, SHORT);
    await expect(indicator(page)).toHaveText('1 / 1');
    await expect(prev(page)).toBeDisabled();
    await expect(next(page)).toBeDisabled();
    await page.keyboard.press('ArrowRight');
    await expect(indicator(page)).toHaveText('1 / 1');
  });

  test('when the book is opened again it starts on the first page', async ({ page }) => {
    await openBook(page, LONG);
    await next(page).click();
    await next(page).click();
    await page.goto('/#/');
    await page.goto(LONG);
    await expect(indicator(page)).toHaveText(/^1 \//);
  });
});

test.describe('headings and anchors', () => {
  test('a link to a heading opens the page that contains it', async ({ page }) => {
    await page.goto(`${LONG}#section-7`);
    await expect(page.getByTestId('book-sheet')).toBeVisible();
    const heading = page.locator('.prose h2', { hasText: 'Section 7' });
    await expect.poll(() => onScreen(heading)).toBe(true);
    const { current, total } = await pageState(page);
    expect(current).toBeGreaterThan(1);
    expect(current).toBeLessThan(total);
    await expect(page.getByRole('heading', { level: 1, name: /not found/i })).toHaveCount(0);
  });

  test('moving between headings of the open book turns pages without rebuilding it', async ({ page }) => {
    await openBook(page, LONG);
    await page.evaluate(() => ((window as unknown as { __prose: Element }).__prose = document.querySelector('.prose')!));
    const sameBook = () =>
      page.evaluate(() => (window as unknown as { __prose: Element }).__prose === document.querySelector('.prose'));

    await page.evaluate(() => (location.hash = '#/book/pagination/long-book#section-9'));
    await expect.poll(() => onScreen(page.locator('.prose h2', { hasText: 'Section 9' }))).toBe(true);
    const late = (await pageState(page)).current;

    await page.evaluate(() => (location.hash = '#/book/pagination/long-book#section-2'));
    await expect.poll(() => onScreen(page.locator('.prose h2', { hasText: 'Section 2' }))).toBe(true);
    expect((await pageState(page)).current).toBeLessThan(late);
    expect(await sameBook()).toBe(true);

    await page.evaluate(() => (location.hash = '#/read/pagination/long-book')); // no heading: back to the start
    await expect(indicator(page)).toHaveText(/^1 \//);
    expect(await sameBook()).toBe(true);
  });

  test('the browser back button returns to the previous heading', async ({ page }) => {
    await page.goto(`${LONG}#section-3`);
    await expect.poll(() => onScreen(page.locator('.prose h2', { hasText: 'Section 3' }))).toBe(true);
    await page.evaluate(() => (location.hash = '#/book/pagination/long-book#section-8'));
    await expect.poll(() => onScreen(page.locator('.prose h2', { hasText: 'Section 8' }))).toBe(true);
    await page.goBack();
    await expect.poll(() => onScreen(page.locator('.prose h2', { hasText: 'Section 3' }))).toBe(true);
  });

  test('an unknown heading is ignored and the book opens normally', async ({ page }) => {
    await page.goto(`${LONG}#no-such-heading`);
    await expect(indicator(page)).toHaveText(/^1 \/ \d+$/);
  });
});

test.describe('manual page breaks and chapters', () => {
  test('<!-- pagebreak --> starts a new page, without empty pages and without showing the instruction', async ({ page }) => {
    await openBook(page, BREAKS);
    await expect(indicator(page)).toHaveText('1 / 4'); // leading, repeated and trailing breaks add nothing
    await expect(page.locator('.prose')).not.toContainText('pagebreak');

    const texts = ['Alpha page text.', 'Beta page text.', 'Gamma page text.', 'Delta page text.'];
    for (const [i, text] of texts.entries()) {
      await expect(indicator(page)).toHaveText(`${i + 1} / 4`);
      await expect.poll(() => onScreen(page.getByText(text))).toBe(true);
      for (const other of texts.filter((t) => t !== text)) {
        await expect.poll(() => onScreen(page.getByText(other)), `${other} on page ${i + 1}`).toBe(false);
      }
      if (i < 3) await next(page).click();
    }
  });

  test('chapterBreak "h2" starts a page at each chapter, keeping a part title with its first chapter', async ({ page }) => {
    await openBook(page, CHAPTERS);
    await expect(indicator(page)).toHaveText('1 / 4');
    await expect.poll(() => onScreen(page.getByText('Introduction of the book.'))).toBe(true);

    const expected = [
      ['Chapter One', 'Text of chapter one.'],
      ['Chapter Two', 'Text of chapter two.'],
      ['Part Two', 'Chapter Three'],
    ];
    for (const [i, [heading, text]] of expected.entries()) {
      await next(page).click();
      await expect(indicator(page)).toHaveText(`${i + 2} / 4`);
      await expect.poll(() => onScreen(page.getByRole('heading', { name: heading, exact: true }))).toBe(true);
      await expect.poll(() => onScreen(page.getByText(text))).toBe(true);
    }
  });

  test('a book keeps the same chapters and breaks after being resized', async ({ page }) => {
    await openBook(page, CHAPTERS);
    await page.setViewportSize({ width: 600, height: 560 });
    await expect(indicator(page)).toHaveText('1 / 4');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => onScreen(page.getByRole('heading', { name: 'Chapter One' }))).toBe(true);
  });
});

test.describe('resizing', () => {
  test('recalculates the number of pages and keeps the reading position', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 760 });
    await openBook(page, LONG);
    const wide = await pageState(page);

    await page.goto(`${LONG}#section-6`);
    await expect.poll(() => onScreen(page.locator('.prose h2', { hasText: 'Section 6' }))).toBe(true);
    await settled(page);
    const before = await visibleLabels(page);
    expect(before.length).toBeGreaterThan(1);

    await page.setViewportSize({ width: 440, height: 560 });
    await expect.poll(async () => (await pageState(page)).total).toBeGreaterThan(wide.total);
    // the reader is still where they were: the text at the top of the page is still on the page
    await expect.poll(async () => (await visibleLabels(page)).includes(before[0])).toBe(true);
    expect((await pageState(page)).current).toBeGreaterThan(1);

    const narrow = await visibleLabels(page);
    await page.setViewportSize({ width: 720, height: 760 });
    await expect.poll(async () => (await pageState(page)).total).toBe(wide.total);
    await expect.poll(async () => (await visibleLabels(page)).includes(narrow[0])).toBe(true);
  });

  test('the indicator and the buttons stay consistent after a resize', async ({ page }) => {
    await openBook(page, LONG);
    const before = (await pageState(page)).total;
    await page.setViewportSize({ width: 700, height: 500 });
    await expect.poll(async () => (await pageState(page)).total).toBeGreaterThan(before);
    const { total } = await pageState(page);
    for (let i = 1; i < total; i++) await next(page).click();
    await expect(indicator(page)).toHaveText(`${total} / ${total}`);
    await expect(next(page)).toBeDisabled();
  });

  test('stays on the first page when the reader was on the first page', async ({ page }) => {
    await openBook(page, LONG);
    await page.setViewportSize({ width: 800, height: 520 });
    await expect(indicator(page)).toHaveText(/^1 \//);
    await page.setViewportSize({ width: 720, height: 800 });
    await expect(indicator(page)).toHaveText(/^1 \//);
  });
});

test.describe('hard content', () => {
  /** Every page of the book, in order, with a callback that sees each one. */
  async function forEachPage(page: Page, check: (pageNumber: number) => Promise<void>) {
    const { total } = await pageState(page);
    expect(total).toBeLessThan(80); // sanity: a few dozen pages, not hundreds
    for (let n = 1; n <= total; n++) {
      await expect(indicator(page)).toHaveText(`${n} / ${total}`);
      await settled(page);
      await check(n);
      if (n < total) await next(page).click();
    }
    return total;
  }

  test('every part of the book can be read: nothing disappears', async ({ page }) => {
    await openBook(page, HARD);
    const markers = ['MARK-CODE-END', 'MARK-TABLE-END', 'MARK-LIST-END', 'MARK-PARA-END', 'MARK-BOOK-END'];
    const seen = new Set<string>();
    for (const alt of ['Tall test image', 'Wide test image']) markers.push(`img:${alt}`);

    await forEachPage(page, async () => {
      for (const marker of markers) {
        const target = marker.startsWith('img:')
          ? page.getByRole('img', { name: marker.slice(4) })
          : page.locator('.prose').getByText(marker);
        if (await onScreen(target)) seen.add(marker);
      }
    });
    expect([...seen].sort()).toEqual([...markers].sort());
  });

  test('nothing is cut off at the bottom of a page, and nothing sticks out sideways', async ({ page }) => {
    await openBook(page, HARD);
    await forEachPage(page, async (n) => {
      const problems = await page.evaluate(() => {
        const view = document.querySelector('.book__clip')!.getBoundingClientRect();
        const found: string[] = [];
        for (const el of document.querySelectorAll('.prose p, .prose li, .prose pre, .prose tr, .prose img, .prose h2, .prose blockquote')) {
          if (el.closest('[hidden]')) continue;
          // text lines of the element that are on this page
          const range = document.createRange();
          range.selectNodeContents(el);
          const boxes = el.tagName === 'IMG' ? [...el.getClientRects()] : [...range.getClientRects()];
          for (const r of boxes) {
            if (r.width === 0 || r.height === 0) continue;
            const visible = r.right > view.left + 1 && r.left < view.right - 1;
            if (!visible) continue;
            if (r.bottom > view.bottom + 1) found.push(`${el.tagName} cut off at the bottom`);
            if (r.top < view.top - 1) found.push(`${el.tagName} cut off at the top`);
            if (r.right > view.right + 1 || r.left < view.left - 1) found.push(`${el.tagName} sticks out sideways`);
          }
        }
        return [...new Set(found)];
      });
      expect(problems, `page ${n}`).toEqual([]);
    });
  });

  test('a tall image is shown whole on one page, and a wide image fits the page width', async ({ page }) => {
    await openBook(page, HARD);
    const tall = page.getByRole('img', { name: 'Tall test image' });
    const wide = page.getByRole('img', { name: 'Wide test image' });
    await forEachPage(page, async () => {
      for (const [img, ratio] of [[tall, 600 / 2400], [wide, 3000 / 120]] as const) {
        if (!(await onScreen(img))) continue;
        const box = (await img.boundingBox())!;
        const view = (await clip(page).boundingBox())!;
        expect(box.height).toBeLessThanOrEqual(view.height + 1);
        expect(box.width).toBeLessThanOrEqual(view.width + 1);
        expect(box.width / box.height).toBeCloseTo(ratio, 0);
      }
    });
  });

  test('a long code block continues on the next pages and wraps its long lines', async ({ page }) => {
    await openBook(page, HARD);
    const code = page.locator('.prose pre');
    const pagesWithCode = new Set<number>();
    await forEachPage(page, async (n) => {
      if (await onScreen(code)) pagesWithCode.add(n);
    });
    expect(pagesWithCode.size).toBeGreaterThan(1);
    expect(await code.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  });

  test('works on a phone: same content, readable controls, no sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await openBook(page, HARD);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const button of [prev(page), next(page)]) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44); // comfortable touch target
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    const seen = new Set<string>();
    await forEachPage(page, async () => {
      for (const marker of ['MARK-CODE-END', 'MARK-TABLE-END', 'MARK-LIST-END', 'MARK-PARA-END', 'MARK-BOOK-END']) {
        if (await onScreen(page.locator('.prose').getByText(marker))) seen.add(marker);
      }
    });
    expect(seen.size).toBe(5);
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });

  test('pages turn with taps on the buttons', async ({ page }) => {
    await openBook(page, LONG);
    const { total } = await pageState(page);
    await next(page).tap();
    await expect(indicator(page)).toHaveText(`2 / ${total}`);
    await next(page).tap();
    await prev(page).tap();
    await expect(indicator(page)).toHaveText(`2 / ${total}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('keeps the reading position when the device is rotated', async ({ page }) => {
    await page.goto(`${LONG}#section-5`);
    await expect(page.getByTestId('book-sheet')).toBeVisible();
    await expect.poll(() => onScreen(paragraph(page, 25))).toBe(true);
    await settled(page);
    const portrait = await visibleLabels(page);
    expect(portrait.length).toBeGreaterThan(1);

    await page.setViewportSize({ width: 844, height: 390 }); // landscape: a different page size
    await expect.poll(async () => (await visibleLabels(page)).some((l) => portrait.includes(l))).toBe(true); // still reading there
    expect((await pageState(page)).current).toBeGreaterThan(1); // not thrown back to the first page

    const landscape = await visibleLabels(page);
    await page.setViewportSize({ width: 390, height: 700 }); // and back
    await expect.poll(async () => (await visibleLabels(page)).some((l) => landscape.includes(l))).toBe(true);
    expect((await pageState(page)).current).toBeGreaterThan(1);
  });
});
