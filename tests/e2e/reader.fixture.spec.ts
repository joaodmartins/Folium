import { expect, test, type Page } from '@playwright/test';

// The cover page, the open book (two pages), page turns, page jumps and themes.
// Runs against tests/fixtures/e2e-library (see playwright.config.ts), at a desktop size unless noted.
//   Long Book     60 numbered paragraphs ("P1 …"), 10 sections: many pages
//   Five Pages    5 pages ("Page A text." …): an odd number, with author and description
//   Hard Cases    huge images, long code, a wide table…

const cover = (name: string) => `/#/book/pagination/${name}`;
const read = (name: string) => `/#/read/pagination/${name}`;

const indicator = (page: Page) => page.getByTestId('page-indicator');
const next = (page: Page) => page.getByTestId('next-page');
const prev = (page: Page) => page.getByTestId('prev-page');
const book = (page: Page) => page.getByTestId('book-sheet');
const theme = (page: Page, name: string) => page.getByTestId(`theme-${name}`);

/** "1–2 / 20" → { first: 1, last: 2, total: 20 };  "5 / 5" → { first: 5, last: 5, total: 5 } */
async function pages(page: Page) {
  const text = (await indicator(page).textContent()) ?? '';
  const match = /^(\d+)(?:–(\d+))? \/ (\d+)$/.exec(text.trim());
  if (!match) throw new Error(`Unexpected indicator: ${JSON.stringify(text)}`);
  return { first: Number(match[1]), last: Number(match[2] ?? match[1]), total: Number(match[3]) };
}

async function openReader(page: Page, name: string) {
  await page.goto(read(name));
  await expect(book(page)).toBeVisible();
  await expect(indicator(page)).toHaveText(/^\d+(–\d+)? \/ \d+$/);
  await expect(book(page)).not.toHaveClass(/book--entering/); // the book has finished sliding in
}

/** Waits until no page turn is being drawn. */
const turnsDone = (page: Page) => expect(book(page)).not.toHaveAttribute('data-turning', /.*/);

/** Visible paragraphs/headings of the real book, with the side of the open book they are on. */
const onScreen = (page: Page) =>
  page.evaluate(() => {
    const clip = document.querySelector('.book__clip')!.getBoundingClientRect();
    const middle = clip.left + clip.width / 2;
    const out: { text: string; side: 'left' | 'right'; left: number; right: number }[] = [];
    for (const el of document.querySelectorAll('.book__clip .prose p, .book__clip .prose h1, .book__clip .prose h2')) {
      for (const r of el.getClientRects()) {
        if (r.width === 0 || r.right <= clip.left + 1 || r.left >= clip.right - 1) continue;
        out.push({ text: (el.textContent ?? '').trim().slice(0, 14), side: r.left + r.width / 2 < middle ? 'left' : 'right', left: r.left, right: r.right });
      }
    }
    return out;
  });
const textsOnScreen = async (page: Page) => [...new Set((await onScreen(page)).map((x) => x.text))];
/** "P12" or "Section 3" from the start of a text. */
const labelsOnScreen = async (page: Page) =>
  [...new Set((await onScreen(page)).map((x) => /^(P\d+|Section \d+)/.exec(x.text)?.[1] ?? x.text))];

const noErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
};

// ---------------------------------------------------------------------------------------------

test.describe('cover', () => {
  test('opening a book shows its cover, with title, author, description and category', async ({ page }) => {
    await page.goto(cover('five-pages'));
    await expect(page.getByTestId('book-cover')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Five Pages');
    await expect(page.locator('.cover-view__author')).toHaveText('by Test Author');
    await expect(page.locator('.cover-view__description')).toContainText('Five pages, one per manual break');
    await expect(page.getByTestId('category-link')).toHaveText('Pagination');
    await expect(page.getByTestId('start-reading')).toBeVisible();
    await expect(page).toHaveTitle('Five Pages · Folium');

    // it is a cover, not a data sheet: nothing of the text, no page controls
    await expect(book(page)).toHaveCount(0);
    await expect(page.getByTestId('book-content')).toHaveCount(0);
    await expect(page.getByTestId('page-indicator')).toHaveCount(0);
  });

  test('a book without a cover image gets a printed cover made from its title and author', async ({ page }) => {
    await page.goto(cover('five-pages'));
    const printed = page.locator('.book-cover--printed');
    await expect(printed).toBeVisible();
    await expect(printed.locator('.book-cover__title')).toHaveText('Five Pages');
    await expect(printed.locator('.book-cover__author')).toHaveText('Test Author');
    await expect(printed.locator('img')).toHaveCount(0);
  });

  test('every book gets its own colour', async ({ page }) => {
    const colour = async (name: string) => {
      await page.goto(cover(name));
      return page.locator('.book-cover__board').evaluate((el) => getComputedStyle(el).backgroundImage);
    };
    const [a, b] = [await colour('five-pages'), await colour('long-book')];
    expect(a).not.toBe(b);
  });

  test('the cover is the main thing on the page: big, book-proportioned and with depth', async ({ page }) => {
    await page.goto(cover('five-pages'));
    const size = await page.locator('.book-cover').evaluate((el) => ({ w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight }));
    expect(size.h).toBeGreaterThan(380);
    expect(size.w / size.h).toBeCloseTo(2 / 3, 1);
    const depth = await page.locator('.book-cover').evaluate((el) => {
      const style = getComputedStyle(el);
      return { transform: style.transform, filter: style.filter, preserve: style.transformStyle };
    });
    expect(depth.transform).not.toBe('none'); // seen slightly from the side
    expect(depth.filter).toContain('drop-shadow'); // and casting a shadow
    expect(depth.preserve).toBe('preserve-3d');
    // the cover is bigger than the title block: it is what the eye goes to
    const coverBox = (await page.locator('.book-cover').boundingBox())!;
    const infoBox = (await page.locator('.cover-view__info').boundingBox())!;
    expect(coverBox.height).toBeGreaterThan(infoBox.height);
  });

  test('"Start reading" opens the open book, and the cover is gone', async ({ page }) => {
    await page.goto(cover('five-pages'));
    await page.getByTestId('start-reading').click();
    await expect(page).toHaveURL(/#\/read\/pagination\/five-pages$/);
    await expect(book(page)).toBeVisible();
    await expect(page.getByTestId('book-cover')).toHaveCount(0);
    await expect(page.getByTestId('start-reading')).toHaveCount(0);
    await expect(indicator(page)).toHaveText('1–2 / 5');
  });

  test('the cover swings open before the book appears (and not with reduced motion)', async ({ page }) => {
    await page.goto(cover('five-pages'));
    await page.getByTestId('start-reading').click();
    // right after the click the cover is still there, being animated
    await expect(page.locator('.book-cover__board')).toHaveCount(1);
    expect(await page.locator('.book-cover__board').evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
    await expect(book(page)).toBeVisible({ timeout: 5000 });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(cover('five-pages'));
    await page.getByTestId('start-reading').click();
    await expect(page).toHaveURL(/#\/read\//);
    await expect(book(page)).toBeVisible();
  });

  test('the reader shows no title, author, description or category: only a slim bar and the book', async ({ page }) => {
    await openReader(page, 'five-pages');
    const bar = page.locator('.reader-bar');
    await expect(bar).not.toContainText('Five Pages');
    await expect(bar).not.toContainText('Test Author');
    await expect(page.locator('.reader-page')).not.toContainText('Five pages, one per manual break');
    await expect(page.locator('.cover-view__author, .cover-view__description, .details, .breadcrumbs')).toHaveCount(0);
    expect((await bar.boundingBox())!.height).toBeLessThan(64);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Five Pages'); // for screen readers
  });

  test('there is a clear way back to the category and the library, from the cover and from the reader', async ({ page }) => {
    await page.goto(cover('five-pages'));
    await page.getByTestId('back-link').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Pagination' })).toBeVisible();

    await page.goto(cover('five-pages'));
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Folium' }).click();
    await expect(page.getByTestId('logo')).toBeVisible();

    await openReader(page, 'five-pages');
    await page.getByTestId('back-link').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Pagination' })).toBeVisible();
  });

  test('the browser back button goes from the reader to the cover', async ({ page }) => {
    await page.goto(cover('five-pages'));
    await page.getByTestId('start-reading').click();
    await expect(book(page)).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('book-cover')).toBeVisible();
    await expect(book(page)).toHaveCount(0);
    await page.goForward();
    await expect(book(page)).toBeVisible();
  });

  test('a book in the library leads to its cover', async ({ page }) => {
    await page.goto('/#/category/pagination');
    await page.getByTestId('book-card').filter({ hasText: 'Five Pages' }).click();
    await expect(page.getByTestId('book-cover')).toBeVisible();
  });
});

test.describe('the open book', () => {
  test('shows two pages side by side, with the spine between them', async ({ page }) => {
    await openReader(page, 'long-book');
    await expect(book(page)).toHaveAttribute('data-pages', '2');
    await expect(indicator(page)).toHaveText(/^1–2 \/ \d+$/);

    const items = await onScreen(page);
    const left = items.filter((x) => x.side === 'left');
    const right = items.filter((x) => x.side === 'right');
    expect(left.length).toBeGreaterThan(2);
    expect(right.length).toBeGreaterThan(2);
    const gutter = Math.min(...right.map((x) => x.left)) - Math.max(...left.map((x) => x.right));
    expect(gutter).toBeGreaterThan(30); // the inner margins of both pages, around the spine

    const spine = await page.locator('.book__spine').evaluate((el) => ({ display: getComputedStyle(el).display, w: el.getBoundingClientRect().width }));
    expect(spine.display).not.toBe('none');
    expect(spine.w).toBeGreaterThan(40);
  });

  test('looks like a book on a desk: paper, page edges, hard cover and shadow, on a different surface', async ({ page }) => {
    await openReader(page, 'long-book');
    const look = await page.evaluate(() => {
      const bookEl = document.querySelector('.book')!;
      const stage = document.querySelector('.reader-stage')!;
      const before = getComputedStyle(bookEl, '::before');
      return {
        paper: getComputedStyle(bookEl).backgroundColor,
        desk: getComputedStyle(document.querySelector('.reader-page')!).backgroundColor,
        edges: getComputedStyle(bookEl).boxShadow,
        coverColour: before.backgroundColor,
        coverShadow: before.boxShadow,
        stageIsolated: getComputedStyle(stage).isolation,
      };
    });
    expect(look.paper).not.toBe(look.desk);
    expect(look.edges).not.toBe('none');
    expect(look.coverColour).not.toBe('rgba(0, 0, 0, 0)');
    expect(look.coverShadow).not.toBe('none');
    expect(look.stageIsolated).toBe('isolate');
  });

  test('uses most of the screen: big pages, little around them', async ({ page }) => {
    await openReader(page, 'long-book');
    const stage = (await page.locator('.reader-stage').boundingBox())!;
    const box = (await book(page).boundingBox())!;
    expect(box.height).toBeGreaterThan(stage.height * 0.9);
    expect(box.width).toBeGreaterThan(900); // of 1280
    // centred
    expect(Math.abs(box.x + box.width / 2 - 1280 / 2)).toBeLessThan(2);
    // the bar is slim, and nothing but the bar is above the book
    const bar = (await page.locator('.reader-bar').boundingBox())!;
    expect(bar.height).toBeLessThan(64);
    expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('the first view is pages 1 and 2: no blank page before the first one', async ({ page }) => {
    await openReader(page, 'five-pages');
    const items = await onScreen(page);
    expect(items.find((x) => x.text.startsWith('Page A'))?.side).toBe('left');
    expect(items.find((x) => x.text.startsWith('Page B'))?.side).toBe('right');
  });

  test('page numbers are individual pages: 1–2, 3–4 … and the last, odd page alone', async ({ page }) => {
    await openReader(page, 'five-pages');
    await expect(indicator(page)).toHaveText('1–2 / 5');

    await next(page).click();
    await expect(indicator(page)).toHaveText('3–4 / 5');
    await turnsDone(page);
    let items = await onScreen(page);
    expect(items.find((x) => x.text.startsWith('Page C'))?.side).toBe('left');
    expect(items.find((x) => x.text.startsWith('Page D'))?.side).toBe('right');

    await next(page).click();
    await expect(indicator(page)).toHaveText('5 / 5');
    await turnsDone(page);
    items = await onScreen(page);
    expect(items.map((x) => x.text)).toEqual(['Page E text.']); // nothing is invented for the empty right-hand page
    expect(items[0].side).toBe('left');
    await expect(next(page)).toBeDisabled();

    await prev(page).click();
    await expect(indicator(page)).toHaveText('3–4 / 5');
  });

  test('the numbers match the pages: the page typed is on screen', async ({ page }) => {
    await openReader(page, 'five-pages');
    for (const [typed, expected, letter] of [['4', '3–4 / 5', 'Page D'], ['2', '1–2 / 5', 'Page B'], ['5', '5 / 5', 'Page E'], ['3', '3–4 / 5', 'Page C']] as const) {
      await page.getByTestId('page-current').click();
      await page.getByTestId('page-input').fill(typed);
      await page.keyboard.press('Enter');
      await expect(indicator(page)).toHaveText(expected);
      expect((await textsOnScreen(page)).some((t) => t.startsWith(letter)), `page ${typed} is on screen`).toBe(true);
    }
  });

  test('reading order: each view continues where the previous one ended', async ({ page }) => {
    await openReader(page, 'long-book');
    const number = (label: string) => Number(/^P(\d+)/.exec(label)?.[1] ?? NaN);
    let previousLast = 0;
    for (let i = 0; i < 4; i++) {
      const paragraphs = (await labelsOnScreen(page)).filter((l) => l.startsWith('P')).map(number);
      expect(Math.min(...paragraphs)).toBeGreaterThanOrEqual(previousLast); // a paragraph may continue across views
      expect(Math.min(...paragraphs)).toBeLessThanOrEqual(previousLast + 1);
      previousLast = Math.max(...paragraphs);
      await next(page).click();
      await turnsDone(page);
    }
    expect(previousLast).toBeGreaterThan(10);
  });

  test('a tall window is not a reason to stretch the pages: they keep a book-like shape', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openReader(page, 'long-book');
    const box = (await book(page).boundingBox())!;
    expect(box.width / 2 / box.height).toBeCloseTo(0.72, 1);
    const desk = (await page.locator('.reader-stage').boundingBox())!;
    expect(box.width).toBeLessThan(desk.width - 100); // the desk shows around the book
  });

  test('works with big images, long code and wide tables: nothing is cut off, nothing sticks out of its page', async ({ page }) => {
    await openReader(page, 'hard-cases');
    const { total } = await pages(page);
    expect(total).toBeLessThan(80);
    const problems: string[] = [];
    for (let guard = 0; guard < 60; guard++) {
      await turnsDone(page);
      const found = await page.evaluate(() => {
        const clip = document.querySelector('.book__clip')!.getBoundingClientRect();
        const column = (document.querySelector('.book__pages') as HTMLElement).offsetWidth;
        const gap = 48;
        const out: string[] = [];
        for (const el of document.querySelectorAll('.book__clip .prose p, .prose li, .prose pre, .prose tr, .prose img, .prose h2, .prose blockquote')) {
          if (el.closest('[hidden]')) continue;
          const range = document.createRange();
          range.selectNodeContents(el);
          const boxes = el.tagName === 'IMG' ? [...el.getClientRects()] : [...range.getClientRects()];
          for (const r of boxes) {
            if (r.width === 0 || r.height === 0 || r.right <= clip.left + 1 || r.left >= clip.right - 1) continue;
            const x = r.left - clip.left;
            const inLeft = x + r.width <= column + 1.5;
            const inRight = x >= column + gap - 1.5 && x + r.width <= 2 * column + gap + 1.5;
            if (!inLeft && !inRight) out.push(`${el.tagName} not inside a page`);
            if (r.bottom > clip.bottom + 1) out.push(`${el.tagName} cut off at the bottom`);
          }
        }
        return [...new Set(out)];
      });
      const here = (await pages(page)).first;
      problems.push(...found.map((f) => `${here}: ${f}`));
      if (await next(page).isDisabled()) break;
      await next(page).click();
    }
    expect(problems).toEqual([]);
    await expect(indicator(page)).toHaveText(new RegExp(`${total} / ${total}$`));
  });
});

test.describe('navigation', () => {
  test('previous and next turn two pages at a time and respect the limits', async ({ page }) => {
    await openReader(page, 'long-book');
    const { total } = await pages(page);
    await expect(prev(page)).toBeDisabled();
    await next(page).click();
    await expect(indicator(page)).toHaveText(`3–4 / ${total}`);
    await next(page).click();
    await expect(indicator(page)).toHaveText(`5–6 / ${total}`);
    await prev(page).click();
    await prev(page).click();
    await expect(indicator(page)).toHaveText(`1–2 / ${total}`);
    await expect(prev(page)).toBeDisabled();

    for (let i = 0; i < total; i++) {
      if (await next(page).isDisabled()) break;
      await next(page).click();
    }
    await expect(next(page)).toBeDisabled();
    const last = await pages(page);
    expect(last.last).toBe(total);
    await next(page).click({ force: true }).catch(() => undefined); // a disabled button does nothing
    await page.keyboard.press('ArrowRight');
    expect((await pages(page)).last).toBe(total);
  });

  test('the left and right arrow keys turn pages', async ({ page }) => {
    await openReader(page, 'long-book');
    const { total } = await pages(page);
    await page.keyboard.press('ArrowRight');
    await expect(indicator(page)).toHaveText(`3–4 / ${total}`);
    await page.keyboard.press('ArrowRight');
    await expect(indicator(page)).toHaveText(`5–6 / ${total}`);
    await page.keyboard.press('ArrowLeft');
    await expect(indicator(page)).toHaveText(`3–4 / ${total}`);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft'); // already at the start
    await expect(indicator(page)).toHaveText(`1–2 / ${total}`);
  });

  test('typing a page number goes to the view that holds it', async ({ page }) => {
    const errors = noErrors(page);
    await openReader(page, 'long-book');
    const current = page.getByTestId('page-current');
    await expect(current).toHaveText('1');
    await current.click();
    const field = page.getByTestId('page-input');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('1');

    await field.fill('9');
    await page.keyboard.press('Enter');
    await expect(indicator(page)).toHaveText(/^9–10 \//);
    await expect(field).toHaveCount(0); // the field closes

    await current.click();
    await page.getByTestId('page-input').fill('10'); // the right-hand page of the same view
    await page.keyboard.press('Enter');
    await expect(indicator(page)).toHaveText(/^9–10 \//);

    const { total } = await pages(page);
    await current.click();
    await page.getByTestId('page-input').fill(String(total));
    await page.keyboard.press('Enter');
    expect((await pages(page)).last).toBe(total);
    await current.click();
    await page.getByTestId('page-input').fill('1');
    await page.keyboard.press('Enter');
    await expect(indicator(page)).toHaveText(new RegExp(`^1–2 / ${total}$`));
    expect(errors).toEqual([]);
  });

  test('invalid numbers go nowhere, explain themselves, and cause no errors', async ({ page }) => {
    const errors = noErrors(page);
    await openReader(page, 'long-book');
    const { total } = await pages(page);
    await page.keyboard.press('ArrowRight');
    await expect(indicator(page)).toHaveText(`3–4 / ${total}`);
    await turnsDone(page);

    await page.getByTestId('page-current').click();
    const field = page.getByTestId('page-input');
    for (const bad of ['0', '-4', String(total + 1), '99999', 'abc', '2.5', '', '1 2']) {
      await field.fill(bad);
      await page.keyboard.press('Enter');
      await expect(field, bad).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByRole('alert').filter({ hasText: `Enter a page from 1 to ${total}` })).toBeVisible();
    }
    await expect(page.getByTestId('page-input')).toBeVisible(); // still open
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('page-input')).toHaveCount(0);
    await expect(indicator(page)).toHaveText(`3–4 / ${total}`); // nothing moved
    expect(errors).toEqual([]);
  });

  test('Escape and clicking away cancel; the arrow keys do not turn pages while typing', async ({ page }) => {
    await openReader(page, 'long-book');
    const { total } = await pages(page);
    await page.getByTestId('page-current').click();
    await page.getByTestId('page-input').fill('15');
    await page.keyboard.press('ArrowRight'); // moves the caret, not the book
    await page.keyboard.press('ArrowLeft');
    await expect(indicator(page)).not.toHaveText(/^3–4/);
    await page.keyboard.press('Escape');
    await expect(indicator(page)).toHaveText(`1–2 / ${total}`);

    await page.getByTestId('page-current').click();
    await page.getByTestId('page-input').fill('15');
    await page.mouse.click(40, 400); // on the desk
    await expect(page.getByTestId('page-input')).toHaveCount(0);
    await expect(indicator(page)).toHaveText(`1–2 / ${total}`);
  });

  test('the page field works on a phone too', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await openReader(page, 'long-book');
    const { total } = await pages(page);
    await page.getByTestId('page-current').click();
    await expect(page.getByTestId('page-input')).toBeFocused();
    expect(await page.getByTestId('page-input').getAttribute('inputmode')).toBe('numeric');
    await page.getByTestId('page-input').fill('12');
    await page.keyboard.press('Enter');
    await expect(indicator(page)).toHaveText(`12 / ${total}`);
    const box = (await indicator(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });

  test('links to a heading open the view that holds it, in the open book', async ({ page }) => {
    await page.goto(`${read('long-book')}#section-7`);
    await expect(book(page)).toBeVisible();
    await expect.poll(async () => (await labelsOnScreen(page)).includes('Section 7')).toBe(true);
    const state = await pages(page);
    expect(state.first).toBeGreaterThan(2);
    expect(state.first % 2).toBe(1); // a view starts on an odd page: 1, 3, 5…

    // from the cover route too
    await page.goto(`${cover('long-book')}#section-3`);
    await expect.poll(async () => (await labelsOnScreen(page)).includes('Section 3')).toBe(true);
  });

  test('moving between headings does not rebuild the book, and the back button returns', async ({ page }) => {
    await openReader(page, 'long-book');
    await page.evaluate(() => ((window as unknown as { __b: Element }).__b = document.querySelector('.book')!));
    const same = () => page.evaluate(() => (window as unknown as { __b: Element }).__b === document.querySelector('.book'));

    await page.evaluate(() => (location.hash = '#/read/pagination/long-book#section-8'));
    await expect.poll(async () => (await labelsOnScreen(page)).includes('Section 8')).toBe(true);
    await page.evaluate(() => (location.hash = '#/read/pagination/long-book#section-4'));
    await expect.poll(async () => (await labelsOnScreen(page)).includes('Section 4')).toBe(true);
    expect(await same()).toBe(true);

    await page.goBack();
    await expect.poll(async () => (await labelsOnScreen(page)).includes('Section 8')).toBe(true);
  });
});

test.describe('page turn animation', () => {
  test('forward: the right page turns over to the left (a leaf with a front and a back)', async ({ page }) => {
    await openReader(page, 'long-book');
    const { total } = await pages(page);
    await next(page).click();
    await expect(book(page)).toHaveAttribute('data-turning', 'true');
    await expect(book(page)).toHaveAttribute('data-turn', 'forward');
    await expect(page.locator('.flip__leaf')).toHaveCount(1);
    await expect(page.locator('.flip__leaf .flip__face')).toHaveCount(2);
    await expect(indicator(page)).toHaveText(`3–4 / ${total}`); // the numbers are already the destination

    const leaf = await page.locator('.flip__leaf').evaluate((el) => {
      const animation = el.getAnimations()[0];
      const keys = (animation.effect as KeyframeEffect).getKeyframes();
      const style = getComputedStyle(el);
      return {
        from: keys[0].transform,
        to: keys.at(-1)!.transform,
        origin: style.transformOrigin,
        preserve: style.transformStyle,
        duration: (animation.effect as KeyframeEffect).getTiming().duration,
        perspective: getComputedStyle(el.parentElement!).perspective,
      };
    });
    expect(leaf.from).toBe('rotateY(0deg)');
    expect(leaf.to).toBe('rotateY(-180deg)');
    expect(leaf.preserve).toBe('preserve-3d');
    expect(leaf.perspective).not.toBe('none'); // depth
    expect(parseFloat(leaf.origin)).toBeLessThan(1); // it hinges on the spine (its left edge)
    expect(Number(leaf.duration)).toBeLessThan(1000); // fast enough not to get in the way

    await turnsDone(page);
    await expect(page.locator('.flip__leaf')).toHaveCount(0);
    await expect(page.locator('.flip__still')).toHaveCount(0);
  });

  test('backward: the left page turns back over to the right', async ({ page }) => {
    await openReader(page, 'long-book');
    await next(page).click();
    await turnsDone(page);
    await prev(page).click();
    await expect(book(page)).toHaveAttribute('data-turn', 'backward');
    const keys = await page.locator('.flip__leaf').evaluate((el) => (el.getAnimations()[0].effect as KeyframeEffect).getKeyframes().map((k) => k.transform));
    expect(keys[0]).toBe('rotateY(-180deg)');
    expect(keys.at(-1)).toBe('rotateY(0deg)');
    await turnsDone(page);
    await expect(page.locator('.flip__leaf')).toHaveCount(0);
  });

  test('while turning, the screen shows the old pages and the leaf, never a half-and-half mess', async ({ page }) => {
    await openReader(page, 'long-book');
    const before = await labelsOnScreen(page);
    await next(page).click();
    // at the start of the turn the old left page is still visible (a copy under the leaf)
    const stillText = await page.locator('.flip__still').first().evaluate((el) => (el.textContent ?? '').trim().slice(0, 12));
    expect(before.some((l) => stillText.startsWith(l) || l.startsWith(stillText.slice(0, 3)))).toBe(true);
    expect(await page.locator('.flip__copy').count()).toBeGreaterThanOrEqual(3);
    // copies are decoration: no duplicate ids, not focusable, hidden from screen readers
    expect(await page.locator('.flip__layer [id], .book__flip [id]').count()).toBe(0);
    expect(await page.locator('.book__flip').getAttribute('aria-hidden')).toBe('true');
    await turnsDone(page);
  });

  test('clicking quickly never draws two turns at once, and every click counts', async ({ page }) => {
    await openReader(page, 'long-book');
    const { total } = await pages(page);
    const result = await page.evaluate(async () => {
      const button = document.querySelector<HTMLButtonElement>('[data-testid="next-page"]')!;
      let most = 0;
      for (let i = 0; i < 6; i++) {
        button.click();
        most = Math.max(most, document.querySelectorAll('.flip__leaf').length);
        await new Promise((r) => requestAnimationFrame(r));
        most = Math.max(most, document.querySelectorAll('.flip__leaf').length);
      }
      return most;
    });
    expect(result).toBe(1);
    await expect(indicator(page)).toHaveText(`13–14 / ${total}`);
    await turnsDone(page);
    await expect(page.locator('.flip__leaf, .flip__still')).toHaveCount(0);
    await expect(prev(page)).toBeEnabled();
    await expect(next(page)).toBeEnabled();
  });

  test('forward and backward clicks in a burst end where they add up, with a clean book', async ({ page }) => {
    const errors = noErrors(page);
    await openReader(page, 'long-book');
    const { total } = await pages(page);
    await page.evaluate(() => {
      const next = document.querySelector<HTMLButtonElement>('[data-testid="next-page"]')!;
      const prev = document.querySelector<HTMLButtonElement>('[data-testid="prev-page"]')!;
      for (const button of [next, next, next, prev, next, prev, prev, next, next]) button.click();
    });
    await expect(indicator(page)).toHaveText(`7–8 / ${total}`); // +3 −1 +1 −2 +2 = three views on
    await turnsDone(page);
    await expect(page.locator('.flip__leaf, .flip__still')).toHaveCount(0);
    await expect.poll(async () => (await labelsOnScreen(page)).length).toBeGreaterThan(2);
    expect(errors).toEqual([]);
  });

  test('hammering the buttons and keys past both ends is harmless', async ({ page }) => {
    const errors = noErrors(page);
    await openReader(page, 'five-pages');
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    await expect(indicator(page)).toHaveText('5 / 5');
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
    await expect(indicator(page)).toHaveText('1–2 / 5');
    await turnsDone(page);
    await expect(page.locator('.flip__leaf')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the controls work again as soon as the turn ends', async ({ page }) => {
    await openReader(page, 'long-book');
    const { total } = await pages(page);
    await next(page).click();
    await turnsDone(page);
    await expect(next(page)).toBeEnabled();
    await page.keyboard.press('ArrowRight');
    await expect(indicator(page)).toHaveText(`5–6 / ${total}`);
    await page.getByTestId('page-current').click();
    await page.getByTestId('page-input').fill('3');
    await page.keyboard.press('Enter');
    await expect(indicator(page)).toHaveText(`3–4 / ${total}`);
  });

  test('a jump (heading link, page number) during a turn ends it and lands exactly', async ({ page }) => {
    await openReader(page, 'long-book');
    await next(page).click();
    await page.evaluate(() => (location.hash = '#/read/pagination/long-book#section-9'));
    await expect.poll(async () => (await labelsOnScreen(page)).includes('Section 9')).toBe(true);
    await turnsDone(page);
    await expect(page.locator('.flip__leaf')).toHaveCount(0);
    expect((await labelsOnScreen(page)).includes('Section 9')).toBe(true);
  });

  test('a resize during a turn ends it cleanly and keeps the reading position', async ({ page }) => {
    await openReader(page, 'long-book');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await turnsDone(page);
    await next(page).click();
    await page.setViewportSize({ width: 1100, height: 650 });
    await turnsDone(page);
    await expect(page.locator('.flip__leaf, .flip__still')).toHaveCount(0);
    await expect(indicator(page)).toHaveText(/^\d+–\d+ \/ \d+$/);
    expect((await pages(page)).first).toBeGreaterThan(3);
  });

  test('with reduced motion there is no 3D page turn, only a quick change', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openReader(page, 'long-book');
    const { total } = await pages(page);
    await page.evaluate(() => {
      const w = window as unknown as { __leaves: number };
      w.__leaves = 0;
      new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) if (node instanceof Element && (node.matches('.flip__leaf') || node.querySelector('.flip__leaf'))) w.__leaves++;
      }).observe(document.querySelector('.book__flip')!, { childList: true, subtree: true });
    });
    await next(page).click();
    await expect(indicator(page)).toHaveText(`3–4 / ${total}`);
    await prev(page).click();
    await expect(indicator(page)).toHaveText(`1–2 / ${total}`);
    await page.keyboard.press('ArrowRight');
    await expect(indicator(page)).toHaveText(`3–4 / ${total}`);
    expect(await page.evaluate(() => (window as unknown as { __leaves: number }).__leaves)).toBe(0);
    await expect(page.locator('.flip__leaf')).toHaveCount(0);
    expect((await labelsOnScreen(page)).some((l) => /^P(5|6|7|8)$/.test(l))).toBe(true); // content visible, not lost
    // the fade is short
    const fade = await page.locator('.book__clip').evaluate(() => 0);
    expect(fade).toBe(0);
  });

  test('the book appears with a short slide and fade, and not with reduced motion', async ({ page }) => {
    await page.goto(read('long-book'));
    expect(await page.locator('.book').evaluate((el) => getComputedStyle(el).animationName)).toMatch(/book-enter|none/);
    await expect(book(page)).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(book(page)).toBeVisible();
    expect(await page.locator('.book').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});

test.describe('themes', () => {
  const look = (page: Page) =>
    page.evaluate(() => ({
      attribute: document.documentElement.getAttribute('data-theme'),
      desk: getComputedStyle(document.querySelector('.reader-page')!).backgroundColor,
      paper: getComputedStyle(document.querySelector('.book')!).backgroundColor,
      ink: getComputedStyle(document.querySelector('.book__clip .prose p')!).color,
    }));
  const luminance = (css: string) => {
    const [r, g, b] = css.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => ((v / 255) <= 0.03928 ? v / 255 / 12.92 : (((v / 255) + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

  test('has a discreet control with light, dark and sepia', async ({ page }) => {
    await openReader(page, 'long-book');
    await expect(page.getByRole('group', { name: 'Reading theme' })).toBeVisible();
    for (const [name, label] of [['light', 'Light theme'], ['dark', 'Dark theme'], ['sepia', 'Sepia theme']]) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
      await expect(theme(page, name)).toBeVisible();
    }
    await expect(theme(page, 'light')).toHaveAttribute('aria-pressed', 'true');
    const box = (await page.getByRole('group', { name: 'Reading theme' }).boundingBox())!;
    expect(box.width).toBeLessThan(160);
  });

  test('changes the pages and the desk around them, with strong contrast in each theme', async ({ page }) => {
    await openReader(page, 'long-book');
    const looks: Record<string, Awaited<ReturnType<typeof look>>> = {};
    for (const name of ['light', 'dark', 'sepia']) {
      await theme(page, name).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', name);
      await expect(theme(page, name)).toHaveAttribute('aria-pressed', 'true');
      looks[name] = await look(page);
      expect(contrast(looks[name].paper, looks[name].ink), `text contrast in ${name}`).toBeGreaterThan(7);
      expect(looks[name].paper).not.toBe(looks[name].desk); // the book stands out from its surroundings
    }
    expect(new Set(Object.values(looks).map((l) => l.paper)).size).toBe(3);
    expect(new Set(Object.values(looks).map((l) => l.desk)).size).toBe(3);
    expect(luminance(looks.dark.paper)).toBeLessThan(0.1); // dark pages, light text
    expect(luminance(looks.dark.ink)).toBeGreaterThan(0.5);
    expect(luminance(looks.light.paper)).toBeGreaterThan(0.9);
    // sepia: warm paper (red > blue)
    const [r, , b] = looks.sepia.paper.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(b + 20);
  });

  test('changing the theme changes nothing about the pages or the reading position', async ({ page }) => {
    await page.goto(`${read('long-book')}#section-5`);
    await expect(book(page)).toBeVisible();
    await expect.poll(async () => (await labelsOnScreen(page)).includes('Section 5')).toBe(true);
    await turnsDone(page);
    const state = {
      pages: await pages(page),
      labels: await labelsOnScreen(page),
      width: await page.locator('.book__pages').evaluate((el) => el.scrollWidth),
    };
    for (const name of ['dark', 'sepia', 'light', 'dark']) {
      await theme(page, name).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', name);
      expect(await pages(page)).toEqual(state.pages);
      expect(await labelsOnScreen(page)).toEqual(state.labels);
      expect(await page.locator('.book__pages').evaluate((el) => el.scrollWidth)).toBe(state.width);
    }
  });

  test('the choice is remembered between visits, and applies to the whole app', async ({ page }) => {
    await openReader(page, 'long-book');
    await theme(page, 'sepia').click();
    expect(await page.evaluate(() => localStorage.getItem('folium:theme'))).toBe('sepia');

    await page.reload();
    await expect(book(page)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
    await expect(theme(page, 'sepia')).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/#/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
    await page.goto(cover('long-book'));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
    await page.goto(read('long-book'));
    await theme(page, 'dark').click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('a broken stored value is ignored', async ({ page }) => {
    await page.goto('/#/');
    await page.evaluate(() => localStorage.setItem('folium:theme', 'neon'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark|sepia)$/);
  });

  test('the cover and the library are themed too', async ({ page }) => {
    await page.goto(cover('five-pages'));
    const bg = (p: Page) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await bg(page);
    await page.evaluate(() => localStorage.setItem('folium:theme', 'dark'));
    await page.reload();
    expect(await bg(page)).not.toBe(light);
    await expect(page.getByTestId('book-cover')).toBeVisible();
  });
});

test.describe('screens', () => {
  const layouts: [string, number, number, 1 | 2][] = [
    ['laptop', 1366, 768, 2],
    ['desktop', 1920, 1080, 2],
    ['tablet landscape', 1024, 768, 2],
    ['tablet portrait', 768, 1024, 1],
    ['phone portrait', 390, 844, 1],
    ['phone landscape', 844, 390, 1],
    ['small phone', 320, 568, 1],
  ];

  for (const [name, width, height, pagesShown] of layouts) {
    test(`${name} (${width}×${height}): ${pagesShown === 2 ? 'the open book' : 'one page'}, fitting the screen`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openReader(page, 'long-book');
      await expect(book(page)).toHaveAttribute('data-pages', String(pagesShown));
      await expect(indicator(page)).toHaveText(pagesShown === 2 ? /^1–2 \/ \d+$/ : /^1 \/ \d+$/);

      const box = (await book(page).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);

      for (const control of [prev(page), next(page)]) {
        const size = (await control.boundingBox())!;
        expect(size.width).toBeGreaterThanOrEqual(44);
        expect(size.height).toBeGreaterThanOrEqual(44);
      }
      if (pagesShown === 2) {
        const items = await onScreen(page);
        expect(items.some((x) => x.side === 'left') && items.some((x) => x.side === 'right')).toBe(true);
      }
    });
  }

  test('turns pages on a phone, one page at a time, with the page turn drawn too', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openReader(page, 'long-book');
    const { total } = await pages(page);
    await next(page).click();
    await expect(indicator(page)).toHaveText(`2 / ${total}`);
    await expect(page.locator('.flip__leaf')).toHaveCount(1);
    const turn = await page.locator('.flip__leaf').evaluate((el) => ({ left: (el as HTMLElement).style.left, duration: Number((el.getAnimations()[0].effect as KeyframeEffect).getTiming().duration) }));
    expect(parseFloat(turn.left)).toBe(0);
    expect(turn.duration).toBeLessThanOrEqual(600);
    await turnsDone(page);
    await expect(page.locator('.flip__leaf')).toHaveCount(0);
  });

  test('rotating a tablet closes or opens the book, keeping the reader where they were', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${read('long-book')}#section-6`);
    await expect(book(page)).toBeVisible();
    await expect(book(page)).toHaveAttribute('data-pages', '2');
    await expect.poll(async () => (await labelsOnScreen(page)).includes('Section 6')).toBe(true);
    await turnsDone(page);
    const before = await labelsOnScreen(page);

    await page.setViewportSize({ width: 768, height: 1024 }); // upright: one page
    await expect(book(page)).toHaveAttribute('data-pages', '1');
    await expect(indicator(page)).toHaveText(/^\d+ \/ \d+$/);
    await expect.poll(async () => (await labelsOnScreen(page)).includes(before[0])).toBe(true);
    const upright = await labelsOnScreen(page);
    expect((await pages(page)).first).toBeGreaterThan(1);

    await page.setViewportSize({ width: 1024, height: 768 }); // and open again
    await expect(book(page)).toHaveAttribute('data-pages', '2');
    await expect(indicator(page)).toHaveText(/^\d+–\d+ \/ \d+$/);
    await expect.poll(async () => (await labelsOnScreen(page)).includes(upright[0])).toBe(true);
    expect((await pages(page)).first % 2).toBe(1);
  });

  test('shrinking the window from desktop to phone keeps the position', async ({ page }) => {
    await page.goto(`${read('long-book')}#section-7`);
    await expect(book(page)).toBeVisible();
    await expect.poll(async () => (await labelsOnScreen(page)).includes('Section 7')).toBe(true);
    await turnsDone(page);
    const before = await labelsOnScreen(page);
    await page.setViewportSize({ width: 390, height: 700 });
    await expect(book(page)).toHaveAttribute('data-pages', '1');
    await expect.poll(async () => (await labelsOnScreen(page)).includes(before[0])).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(book(page)).toHaveAttribute('data-pages', '2');
    expect((await pages(page)).total).toBeGreaterThan(1);
  });

  test('the cover fits a phone without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(cover('five-pages'));
    await expect(page.getByTestId('book-cover')).toBeVisible();
    await expect(page.getByTestId('start-reading')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const start = (await page.getByTestId('start-reading').boundingBox())!;
    expect(start.height).toBeGreaterThanOrEqual(44);
    await page.getByTestId('start-reading').click();
    await expect(book(page)).toBeVisible();
  });
});

test.describe('basic accessibility', () => {
  test('controls have names, the page numbers are announced, and the book is a landmark', async ({ page }) => {
    await openReader(page, 'long-book');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next page' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Pages 1 and 2 of \d+\. Go to another page/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Pagination/ })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /Pages 1 and 2 of/ })).toHaveCount(1);
    await next(page).click();
    await expect(page.getByRole('status').filter({ hasText: /Pages 3 and 4 of/ })).toHaveCount(1);
    await expect(page.getByTestId('book-content')).toHaveAttribute('aria-busy', 'false');
  });

  test('the whole reader can be used with the keyboard', async ({ page }) => {
    await openReader(page, 'long-book');
    const { total } = await pages(page);
    await next(page).focus();
    await page.keyboard.press('Enter');
    await expect(indicator(page)).toHaveText(`3–4 / ${total}`);
    await expect(next(page)).toBeFocused(); // focus stays where it was

    await page.getByTestId('page-current').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('page-input')).toBeFocused();
    await page.keyboard.type('7');
    await page.keyboard.press('Enter');
    await expect(indicator(page)).toHaveText(`7–8 / ${total}`);
    await expect(page.getByTestId('page-current')).toBeFocused(); // keyboard users keep their place

    await theme(page, 'dark').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('the cover can be used with the keyboard', async ({ page }) => {
    await page.goto(cover('five-pages'));
    await page.getByTestId('start-reading').focus();
    await page.keyboard.press('Enter');
    await expect(book(page)).toBeVisible();
  });

  test('a copy of a page used in the animation is not announced or focusable', async ({ page }) => {
    await openReader(page, 'long-book');
    await next(page).click();
    const hidden = await page.locator('.book__flip').evaluate((el) => ({
      ariaHidden: el.getAttribute('aria-hidden'),
      focusable: el.querySelectorAll('a[href], button, input, [tabindex]:not([tabindex="-1"])').length,
      inert: [...el.querySelectorAll('.flip__copy')].every((copy) => copy.hasAttribute('inert')),
    }));
    expect(hidden).toEqual({ ariaHidden: 'true', focusable: 0, inert: true });
    await turnsDone(page);
  });
});
