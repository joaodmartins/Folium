import { expect, test, type Page } from '@playwright/test';

// The table of contents and the reading progress. Runs against tests/fixtures/e2e-library/Contents:
//   Textbook         chapters (each starts a page), sections, three "Exercises", two headings with formulas,
//                    an empty heading; showTableOfContents: true
//   No Toc           has headings, showTableOfContents: false
//   No Headings      a long text without headings, showTableOfContents: true
//   Single Heading   one heading and a long text (progress has to work inside a single section)

const read = (name: string) => `/#/read/contents/${name}`;
const cover = (name: string) => `/#/book/contents/${name}`;
const TEXTBOOK = read('textbook');
const KEY = (name: string) => `folium:progress:contents/${name}`;

const indicator = (page: Page) => page.getByTestId('page-indicator');
const next = (page: Page) => page.getByTestId('next-page');
const book = (page: Page) => page.getByTestId('book-sheet');
const toggle = (page: Page) => page.getByRole('button', { name: 'Table of contents', exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Contents' });
const items = (page: Page) => page.getByTestId('toc-item');
const turnsDone = (page: Page) => expect(book(page)).not.toHaveAttribute('data-turning', /.*/);

async function openBook(page: Page, route: string) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(route);
  await expect(book(page)).toBeVisible();
  await expect(indicator(page)).toHaveText(/^\d+(–\d+)? \/ \d+$/);
  await expect(book(page)).not.toHaveClass(/book--entering/);
  return errors;
}

/** "5–6 / 30" → { first: 5, last: 6, total: 30 } */
async function pages(page: Page) {
  await expect(indicator(page)).toHaveText(/^\d+(–\d+)? \/ \d+$/); // the book is open (not still loading, not being edited)
  const match = /^(\d+)(?:–(\d+))? \/ (\d+)$/.exec(((await indicator(page).textContent()) ?? '').trim());
  if (!match) throw new Error('unexpected indicator');
  return { first: Number(match[1]), last: Number(match[2] ?? match[1]), total: Number(match[3]) };
}

const stored = (page: Page, name: string) => page.evaluate((k) => localStorage.getItem(k), KEY(name));

/** Opens the panel (clicking the button) and returns the id of the entry marked as current. */
async function activeInPanel(page: Page) {
  await toggle(page).click();
  await expect(dialog(page)).toBeVisible();
  const id = await page.locator('[data-testid="toc-item"][aria-current]').getAttribute('data-id');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  return id;
}

/** The heading the table of contents should mark, worked out from where things really are on screen. */
const expectedActive = (page: Page) =>
  page.evaluate(() => {
    const pagesEl = document.querySelector('.book__pages') as HTMLElement;
    const base = pagesEl.getBoundingClientRect().left;
    const step = pagesEl.offsetWidth + 48;
    const firstVisible = Number(/^(\d+)/.exec(document.querySelector('[data-testid="page-indicator"]')!.textContent!)![1]) - 1;
    const entries = new Set([...document.querySelectorAll('[data-testid="toc-item"]')].map((b) => b.getAttribute('data-id')));
    let found: string | null = null;
    for (const h of pagesEl.querySelectorAll<HTMLElement>('h1, h2, h3')) {
      if (!entries.has(h.id)) continue;
      const rect = h.getClientRects()[0];
      const startPage = rect ? Math.floor((rect.left - base + 1) / step) : 0;
      if (startPage <= firstVisible) found = h.id;
    }
    return found;
  });

const headingsOnScreen = (page: Page) =>
  page.evaluate(() => {
    const clipElement = document.querySelector('.book__clip');
    if (!clipElement) return [];
    const clip = clipElement.getBoundingClientRect();
    return [...document.querySelectorAll('.book__clip .prose h1, .book__clip .prose h2, .book__clip .prose h3')]
      .filter((h) => [...h.getClientRects()].some((r) => r.width > 0 && r.right > clip.left + 1 && r.left < clip.right - 1))
      .map((h) => h.id);
  });

// -------------------------------------------------------------------------------------------------

test.describe('opening and closing the table of contents', () => {
  test('a discreet button in the bar opens a panel over the book, and the book keeps its size and place', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await expect(toggle(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog(page)).toBeHidden();
    const bar = (await page.locator('.reader-bar').boundingBox())!;
    expect((await toggle(page).boundingBox())!.y).toBeGreaterThanOrEqual(bar.y - 1); // it is in the bar

    const geometry = async () => ({
      book: await book(page).boundingBox(),
      clip: await page.locator('.book__clip').boundingBox(),
      indicator: await indicator(page).textContent(),
      scroll: await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]),
    });
    const before = await geometry();

    await toggle(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    expect(await geometry()).toEqual(before); // an overlay: nothing moved or resized
    const panel = (await dialog(page).boundingBox())!;
    expect(panel.x).toBeLessThanOrEqual(1);
    expect(panel.width).toBeLessThanOrEqual(23 * 16 + 1);
    expect(panel.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1); // below the bar: the bar is still reachable

    await page.getByTestId('toc-close').click();
    await expect(dialog(page)).toBeHidden();
    expect(await geometry()).toEqual(before);
  });

  test('closes with its close button, with Escape, by clicking outside, and by choosing a heading', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    const closings: [string, () => Promise<void>][] = [
      ['the close button', () => page.getByTestId('toc-close').click()],
      ['Escape', () => page.keyboard.press('Escape')],
      ['the backdrop', () => page.mouse.click(900, 400)],
      ['choosing a heading', () => items(page).nth(4).click()],
    ];
    for (const [how, close] of closings) {
      await toggle(page).click();
      await expect(dialog(page), `opens before ${how}`).toBeVisible();
      await close();
      await expect(dialog(page), how).toBeHidden();
      await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle(page)).toBeFocused(); // focus goes back to where it was
    }
  });

  test('clicking the button again closes it', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).click();
    await expect(dialog(page)).toBeVisible();
    await toggle(page).click(); // (the panel starts below the bar, so the button stays reachable)
    await expect(dialog(page)).toBeHidden();
  });

  test('lists the chapters and sections in order, nested, with repeated headings and without the empty one', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).click();
    const entries = await items(page).evaluateAll((buttons) => buttons.map((b) => ({ text: (b.textContent ?? '').trim().slice(0, 14), depth: Number((b as HTMLElement).dataset.depth), id: (b as HTMLElement).dataset.id! })));
    expect(entries.map((e) => `${e.depth}:${e.text}`)).toEqual([
      '0:Textbook',
      '1:Chapter 1',
      '2:Section 1.1',
      '2:Section 1.2',
      '1:Chapter 2',
      '2:Section 2.1',
      '2:Exercises',
      expect.stringMatching(/^1:Chapter 3: The/),
      '2:Section 3.1',
      '1:Chapter 4',
      '2:Exercises',
      expect.stringMatching(/^1:Chapter 5: Eul/),
      '2:Section 5.1',
      '1:Chapter 6',
      '2:Exercises',
    ]);
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length); // repeated headings have their own ids
    expect(ids.filter((i) => i.startsWith('exercises'))).toHaveLength(3);
    expect(ids).not.toContain('untitled');
    // the hierarchy shows: deeper entries are indented
    const indent = (n: number) => items(page).nth(n).evaluate((el) => el.getBoundingClientRect().left);
    expect(await indent(2)).toBeGreaterThan(await indent(1));
    expect(await indent(1)).toBeGreaterThan(await indent(0) - 1);
  });

  test('headings with formulas show the rendered formula, never the TeX', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).click();
    const maths = items(page).filter({ has: page.locator('.katex') });
    await expect(maths).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const box = (await maths.nth(i).locator('.katex').boundingBox())!;
      expect(box.width).toBeGreaterThan(10);
    }
    const text = await dialog(page).evaluate((el) => el.textContent ?? '');
    expect(text).not.toMatch(/\\|\$|\^|\{|\}/);
    expect(await dialog(page).locator('annotation').count()).toBe(0);
  });

  test('marks the heading of the current page, and the marked entry is visible in the list', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).click();
    await expect(page.locator('[data-testid="toc-item"][aria-current="location"]')).toHaveText('Textbook');
    await expect(page.locator('[data-testid="toc-item"][aria-current]')).toHaveCount(1);
    await expect(page.locator('[data-testid="toc-item"][aria-current]')).toBeFocused();
  });

  test('the book is not usable while the panel is open (focus stays inside), and the arrow keys do not turn pages', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    const first = await indicator(page).textContent();
    await toggle(page).click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(indicator(page)).toHaveText(first!);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await expect(indicator(page)).not.toHaveText(first!);
  });
});

test.describe('keyboard and screen readers', () => {
  test('Tab and Shift+Tab stay inside the panel; Enter on an entry goes there; focus returns', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeVisible();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog(page).evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await dialog(page).evaluate((el) => el.contains(document.activeElement)), `Shift+Tab ${i + 1}`).toBe(true);
    }
    // choose "Chapter 4" with the keyboard
    await items(page).filter({ hasText: /^Chapter 4$/ }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeHidden();
    await expect(toggle(page)).toBeFocused();
    await turnsDone(page);
    expect(await headingsOnScreen(page)).toContain('chapter-4');
  });

  test('has the roles and names a screen reader needs', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await expect(toggle(page)).toHaveAttribute('aria-haspopup', 'dialog');
    await toggle(page).click();
    await expect(page.getByRole('dialog', { name: 'Contents' })).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('navigation', { name: 'Table of contents' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close table of contents' })).toBeVisible();
    await expect(page.getByRole('list').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chapter 2', exact: true })).toBeVisible(); // entries are buttons with their text as name
    expect(await page.getByTestId('book-content').getAttribute('inert')).not.toBeNull(); // the book is out of the way
  });

  test('every state is visible: hover, keyboard focus and the current entry', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).click();
    const entry = items(page).filter({ hasText: /^Chapter 2$/ });
    const background = () => entry.evaluate((el) => getComputedStyle(el).backgroundColor);
    const idle = await background();
    await entry.hover();
    expect(await background()).not.toBe(idle); // hover
    await entry.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab'); // keyboard focus
    expect(await entry.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    const current = page.locator('[data-testid="toc-item"][aria-current]');
    expect(await current.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  });
});

test.describe('going to a heading', () => {
  test('shows the page that holds it, updates the indicator and closes the panel', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    const first = await pages(page);
    await toggle(page).click();
    await items(page).filter({ hasText: /^Chapter 5/ }).click();
    await expect(dialog(page)).toBeHidden();
    await turnsDone(page);
    await expect.poll(async () => (await headingsOnScreen(page)).some((id) => id.startsWith('chapter-5'))).toBe(true);
    const now = await pages(page);
    expect(now.first).toBeGreaterThan(first.first + 3);
    expect(now.total).toBe(first.total);
  });

  test('reaches headings that are on different pages, and each of three repeated ones is its own', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      await toggle(page).click();
      await items(page).filter({ hasText: /^Exercises$/ }).nth(i).click();
      await turnsDone(page);
      const id = i === 0 ? 'exercises' : `exercises-${i}`;
      await expect.poll(async () => await headingsOnScreen(page), `Exercises #${i + 1}`).toContain(id);
      seen.push((await indicator(page).textContent())!);
    }
    expect(new Set(seen).size).toBe(3);
  });

  test('a heading in the next or previous view is reached with a page turn', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    let turned = false;
    for (let step = 0; step < 14 && !turned; step++) {
      // find an entry that starts exactly on the next view
      await toggle(page).click();
      const target = await page.evaluate(() => {
        const pagesEl = document.querySelector('.book__pages') as HTMLElement;
        const base = pagesEl.getBoundingClientRect().left;
        const stepPx = pagesEl.offsetWidth + 48;
        const firstVisible = Number(/^(\d+)/.exec(document.querySelector('[data-testid="page-indicator"]')!.textContent!)![1]) - 1;
        const wanted = firstVisible + 2; // the next view starts two pages on
        for (const b of document.querySelectorAll('[data-testid="toc-item"]')) {
          const h = document.getElementById((b as HTMLElement).dataset.id!)!;
          const rect = h.getClientRects()[0];
          const startPage = rect ? Math.floor((rect.left - base + 1) / stepPx) : 0;
          if (startPage === wanted || startPage === wanted + 1) return (b as HTMLElement).dataset.id!;
        }
        return null;
      });
      if (target) {
        await page.locator(`[data-testid="toc-item"][data-id="${target}"]`).click();
        await expect(book(page)).toHaveAttribute('data-turning', 'true'); // drawn like any other page turn
        await expect(page.locator('.flip__leaf')).toHaveCount(1);
        await turnsDone(page);
        expect(await headingsOnScreen(page)).toContain(target);
        turned = true;
      } else {
        await page.keyboard.press('Escape');
        await next(page).click();
        await turnsDone(page);
      }
    }
    expect(turned).toBe(true);
  });

  test('a far heading is a jump (no leaf), and the bar keeps working afterwards', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).click();
    await items(page).filter({ hasText: /^Chapter 6$/ }).click();
    await expect(page.locator('.flip__leaf')).toHaveCount(0);
    await expect.poll(async () => await headingsOnScreen(page)).toContain('chapter-6');
    await page.keyboard.press('ArrowLeft');
    await turnsDone(page);
    await expect(next(page)).toBeEnabled();
  });
});

test.describe('the current heading follows the pages', () => {
  test('on every view of the book, the entry marked is the heading of the pages on screen', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    const checked = new Set<string>();
    for (let step = 0; step < 40; step++) {
      await turnsDone(page);
      await toggle(page).click();
      const marked = await page.locator('[data-testid="toc-item"][aria-current]').getAttribute('data-id');
      expect(marked, `view ${(await pages(page)).first}`).toBe(await expectedActive(page));
      checked.add(marked!);
      await page.keyboard.press('Escape');
      if (await next(page).isDisabled()) break;
      await next(page).click();
    }
    expect(checked.size).toBeGreaterThan(8); // the mark moved through the book
  });

  test('follows the page typed in the indicator and the keyboard, not just the panel', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    const { total } = await pages(page);
    for (const typed of [Math.floor(total / 2), total, 3, Math.floor(total * 0.75)]) {
      await page.getByTestId('page-current').click();
      await page.getByTestId('page-input').fill(String(typed));
      await page.keyboard.press('Enter');
      await turnsDone(page);
      await toggle(page).click();
      const marked = await page.locator('[data-testid="toc-item"][aria-current]').getAttribute('data-id');
      expect(marked, `page ${typed}`).toBe(await expectedActive(page));
      await page.keyboard.press('Escape');
    }
  });

  test('a heading chosen in the panel stays marked while it is on screen', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).click();
    await items(page).filter({ hasText: /^Section 3\.1$/ }).click();
    await turnsDone(page);
    expect(await activeInPanel(page)).toBe('section-3-1');
  });

  test('after a resize the mark is still right', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).click();
    await items(page).filter({ hasText: /^Chapter 4$/ }).click();
    await turnsDone(page);
    await page.setViewportSize({ width: 700, height: 760 });
    await expect(book(page)).toHaveAttribute('data-pages', '1');
    await expect(book(page)).not.toHaveAttribute('data-turning', /.*/);
    await toggle(page).click();
    expect(await page.locator('[data-testid="toc-item"][aria-current]').getAttribute('data-id')).toBe(await expectedActive(page));
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(book(page)).toHaveAttribute('data-pages', '2');
    await toggle(page).click();
    expect(await page.locator('[data-testid="toc-item"][aria-current]').getAttribute('data-id')).toBe(await expectedActive(page));
  });
});

test.describe('when there is no table of contents', () => {
  test('showTableOfContents: false → no button and no panel', async ({ page }) => {
    await openBook(page, read('no-toc'));
    await expect(toggle(page)).toHaveCount(0);
    await expect(page.locator('.toc, [data-testid="toc-panel"]')).toHaveCount(0);
    await page.keyboard.press('ArrowRight'); // the reader is otherwise normal
    await expect(indicator(page)).not.toHaveText(/^1–2/);
  });

  test('a book without headings has no button, even with showTableOfContents: true', async ({ page }) => {
    const errors = await openBook(page, read('no-headings'));
    await expect(toggle(page)).toHaveCount(0);
    await expect(page.locator('.toc')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a book with a single heading still has one (the book can be reopened from the start)', async ({ page }) => {
    await openBook(page, read('single-heading'));
    await toggle(page).click();
    await expect(items(page)).toHaveCount(1);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the panel fills the width, lists the book, and a tap goes to the heading', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await expect(book(page)).toHaveAttribute('data-pages', '1');
    const button = (await toggle(page).boundingBox())!;
    expect(button.width).toBeGreaterThanOrEqual(40);
    expect(button.height).toBeGreaterThanOrEqual(40);
    const before = { book: await book(page).boundingBox(), indicator: await indicator(page).textContent() };

    await toggle(page).tap();
    await expect(dialog(page)).toBeVisible();
    const panel = (await dialog(page).boundingBox())!;
    expect(panel.x).toBeLessThanOrEqual(1);
    expect(panel.width).toBeGreaterThanOrEqual(385);
    expect(panel.y + panel.height).toBeLessThanOrEqual(844 + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await book(page).boundingBox()).toEqual(before.book);
    for (const i of [0, 3, 7]) expect((await items(page).nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(40); // easy to tap

    await items(page).filter({ hasText: /^Chapter 3/ }).tap();
    await expect(dialog(page)).toBeHidden();
    await turnsDone(page);
    await expect.poll(async () => (await headingsOnScreen(page)).some((id) => id.startsWith('chapter-3'))).toBe(true);
    expect(await indicator(page).textContent()).not.toBe(before.indicator);
  });

  test('the close button works, and the active entry is marked', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await next(page).click();
    await next(page).click();
    await next(page).click();
    await turnsDone(page);
    await toggle(page).tap();
    expect(await page.locator('[data-testid="toc-item"][aria-current]').getAttribute('data-id')).toBe(await expectedActive(page));
    await page.getByTestId('toc-close').tap();
    await expect(dialog(page)).toBeHidden();
  });

  test('a long list scrolls inside the panel, not the page', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).tap();
    const scrolls = await page.locator('.toc__nav').evaluate((el) => ({ overflow: getComputedStyle(el).overflowY, fits: el.scrollHeight <= el.clientHeight }));
    expect(scrolls.overflow).toBe('auto');
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  });
});

test.describe('themes', () => {
  test('the panel follows Light, Dark and Sepia', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    const looks = new Set<string>();
    for (const name of ['dark', 'sepia', 'light']) {
      await page.getByTestId(`theme-${name}`).click();
      await toggle(page).click();
      looks.add(await dialog(page).evaluate((el) => `${getComputedStyle(el).backgroundColor}|${getComputedStyle(el.querySelector('.toc__item')!).color}`));
      await page.keyboard.press('Escape');
    }
    expect(looks.size).toBe(3);
  });
});

// -------------------------------------------------------------------------------------------------

test.describe('reading progress', () => {
  test('leaving a book and coming back continues where the reader was', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).click();
    await items(page).filter({ hasText: /^Section 3\.1$/ }).click();
    await turnsDone(page);
    await next(page).click();
    await turnsDone(page);
    const where = await indicator(page).textContent();
    const heading = await activeInPanel(page);

    await page.getByTestId('back-link').click(); // out of the book, to its category
    await expect(page.getByRole('heading', { level: 1, name: 'Contents' })).toBeVisible();
    await page.goto(cover('textbook'));
    await page.getByTestId('start-reading').click(); // and back in, from its cover
    await expect(book(page)).toBeVisible();
    await expect(indicator(page)).toHaveText(where!);
    expect(await activeInPanel(page)).toBe(heading);
  });

  test('survives a reload of the page', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).click();
    await items(page).filter({ hasText: /^Chapter 5/ }).click();
    await turnsDone(page);
    await next(page).click();
    await turnsDone(page);
    const where = await indicator(page).textContent();
    await page.reload();
    await expect(book(page)).toBeVisible();
    await expect(indicator(page)).toHaveText(where!);
  });

  test('is saved when the page changes: heading, how far into it, and the page', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    expect(await stored(page, 'textbook')).toBeNull(); // only opened: nothing saved
    await next(page).click();
    await next(page).click();
    await next(page).click();
    await turnsDone(page);
    const saved = JSON.parse((await stored(page, 'textbook'))!);
    expect(saved.page).toBe((await pages(page)).first - 1);
    expect(typeof saved.heading).toBe('string');
    expect(saved.fraction).toBeGreaterThanOrEqual(0);
    expect(saved.fraction).toBeLessThan(1);
    const before = saved.page;
    await next(page).click();
    await turnsDone(page);
    expect(JSON.parse((await stored(page, 'textbook'))!).page).toBeGreaterThan(before);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await turnsDone(page);
    await expect(indicator(page)).toHaveText(/^1–2 \//);
    expect(JSON.parse((await stored(page, 'textbook'))!).page).toBe(0); // going back is remembered too
  });

  test('is kept for each book separately', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await next(page).click();
    await next(page).click();
    await turnsDone(page);
    expect(await stored(page, 'textbook')).not.toBeNull();
    expect(await stored(page, 'no-toc')).toBeNull();
    await openBook(page, read('no-toc'));
    await expect(indicator(page)).toHaveText(/^1–2 \//); // another book: its own beginning
    await next(page).click();
    await turnsDone(page);
    expect(await stored(page, 'no-toc')).not.toBeNull();
    await page.goto(TEXTBOOK);
    expect((await pages(page)).first).toBeGreaterThan(1);
  });

  test('a book that was never opened starts on its first page', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await expect(indicator(page)).toHaveText(/^1–2 \//);
    expect(await stored(page, 'textbook')).toBeNull();
  });

  test('a heading in the link has priority over the saved progress', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).click();
    await items(page).filter({ hasText: /^Chapter 5/ }).click();
    await turnsDone(page);
    await next(page).click();
    await turnsDone(page);
    const saved = await stored(page, 'textbook');

    await page.goto(`${TEXTBOOK}#chapter-2`);
    await page.reload(); // (a reload opens the link again, with progress saved)
    await expect.poll(async () => await headingsOnScreen(page)).toContain('chapter-2');
    expect(await activeInPanel(page)).toBe('chapter-2');
    expect(saved).not.toBeNull();
  });

  test('also from the cover route with a heading', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).click();
    await items(page).filter({ hasText: /^Chapter 6/ }).click();
    await turnsDone(page);
    await next(page).click();
    await page.goto('/#/');
    await page.goto(`${cover('textbook')}#chapter-1`);
    await expect.poll(async () => await headingsOnScreen(page)).toContain('chapter-1');
  });

  test('uses the heading, not the page: the same place is found on a phone, and back on a desktop', async ({ page }) => {
    await openBook(page, TEXTBOOK);
    await toggle(page).click();
    await items(page).filter({ hasText: /^Chapter 4$/ }).click();
    await turnsDone(page);
    await next(page).click();
    await turnsDone(page);
    const section = JSON.parse((await stored(page, 'textbook'))!).heading as string;
    expect(section).toBeTruthy();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/');
    await page.goto(TEXTBOOK);
    await expect(book(page)).toHaveAttribute('data-pages', '1');
    await expect(indicator(page)).toHaveText(/^\d+ \/ \d+$/);
    expect((await pages(page)).first).toBeGreaterThan(5); // not the start of the book
    expect(await activeInPanel(page)).toBe(section); // the same heading's section

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/#/');
    await page.goto(TEXTBOOK);
    await expect(book(page)).toHaveAttribute('data-pages', '2');
    await expect.poll(async () => await headingsOnScreen(page)).toContain(section); // its heading is on one of the two pages
  });

  test('inside a long section (a book with one heading) it finds the place by how far the reader was', async ({ page }) => {
    await openBook(page, read('single-heading'));
    const { total } = await pages(page);
    await page.getByTestId('page-current').click();
    await page.getByTestId('page-input').fill(String(Math.floor(total * 0.6)));
    await page.keyboard.press('Enter');
    await turnsDone(page);
    const share = (await pages(page)).first / total;

    await page.goto('/#/');
    await page.goto(read('single-heading'));
    await expect(book(page)).toBeVisible();
    const again = await pages(page);
    expect(Math.abs(again.first / again.total - share)).toBeLessThan(0.08);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/');
    await page.goto(read('single-heading'));
    await expect(book(page)).toHaveAttribute('data-pages', '1');
    const phone = await pages(page);
    expect(Math.abs(phone.first / phone.total - share)).toBeLessThan(0.1); // the same part of the book on a phone
  });

  test('when the saved heading no longer exists the saved page is used (and kept inside the book)', async ({ page }) => {
    await page.goto('/#/');
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ heading: 'a-chapter-that-was-removed', fraction: 0.5, page: 6, savedAt: 1 })), KEY('textbook'));
    await openBook(page, TEXTBOOK);
    await expect(indicator(page)).toHaveText(/^7–8 \//); // page index 6

    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ heading: 'gone', fraction: 0.1, page: 99999, savedAt: 1 })), KEY('textbook'));
    await page.reload();
    const { first, last, total } = await pages(page);
    expect(last).toBe(total); // the end of the book, not past it
    expect(first).toBeGreaterThan(total - 3);
  });

  test('damaged saved data is ignored', async ({ page }) => {
    await page.goto('/#/');
    for (const bad of ['{"heading": 5', 'null', '"x"', '{"heading":"a","fraction":5,"page":-1}', '']) {
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY('textbook'), bad]);
      const errors = await openBook(page, TEXTBOOK);
      await page.reload();
      await expect(indicator(page), JSON.stringify(bad)).toHaveText(/^1–2 \//);
      expect(errors).toEqual([]);
    }
  });

  test('the reader works when localStorage is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('denied', 'SecurityError');
        },
      });
    });
    const errors = await openBook(page, TEXTBOOK);
    await next(page).click();
    await next(page).click();
    await turnsDone(page);
    await toggle(page).click();
    await items(page).filter({ hasText: /^Chapter 4$/ }).click();
    await turnsDone(page);
    await page.getByTestId('theme-dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await headingsOnScreen(page)).toContain('chapter-4');
    expect(errors).toEqual([]);
  });

  test('the reader works when saving is refused (storage full)', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('full', 'QuotaExceededError');
      };
    });
    const errors = await openBook(page, TEXTBOOK);
    await next(page).click();
    await next(page).click();
    await turnsDone(page);
    await expect(indicator(page)).toHaveText(/^5–6 \//);
    expect(errors).toEqual([]);
  });

  test('progress works for books without a table of contents too', async ({ page }) => {
    await openBook(page, read('no-toc'));
    await next(page).click();
    await next(page).click();
    await turnsDone(page);
    const where = await indicator(page).textContent();
    await page.goto('/#/');
    await page.goto(read('no-toc'));
    await expect(indicator(page)).toHaveText(where!);
  });
});
