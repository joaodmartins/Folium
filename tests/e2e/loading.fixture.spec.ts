import { expect, test, type Page } from '@playwright/test';
import { farFrom, mix, parseColour, pixelAt } from './support/pixels';

// Opening a book: nothing but the loading message (on the desk) until the book is ready, then the book,
// whole and in place. In particular: no brown (the leather of the cover) where the pages should be.
// Runs against tests/fixtures/e2e-library (Reading: code and headings; Rich: formulas, code, images).

const BOOKS = {
  'Code Blocks': '/#/read/reading/code-blocks',
  Headings: '/#/read/reading/headings',
  'Rich Content (formulas, code)': '/#/read/rich/rich-content',
} as const;
const THEMES = ['light', 'dark', 'sepia'] as const;
const SIZES = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } } as const;

const book = (page: Page) => page.getByTestId('book-sheet');
const colours = (page: Page) =>
  page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return { paper: css.getPropertyValue('--page-bg'), desk: css.getPropertyValue('--desk'), leather: css.getPropertyValue('--cover-leather') };
  });

/** Freezes the entrance animation of the book `at` ms in, as soon as it starts. */
async function freezeEntrance(page: Page, at: number) {
  await page.addInitScript((time) => {
    const watch = new MutationObserver(() => {
      const el = document.querySelector('.book--entering');
      const animation = el?.getAnimations()[0];
      if (!el || !animation || (window as unknown as { __frozen?: boolean }).__frozen) return;
      animation.pause();
      animation.currentTime = time;
      (window as unknown as { __frozen?: boolean }).__frozen = true;
    });
    watch.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }, at);
}

/** A point on the paper of the book that has no text on it: just inside its right edge, halfway down. */
const paperPoint = (page: Page) =>
  book(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.right - 9, y: r.top + r.height / 2, opacity: Number(getComputedStyle(el).opacity) };
  });

for (const [sizeName, viewport] of Object.entries(SIZES)) {
  test.describe(`${sizeName}`, () => {
    test.use({ viewport });

    for (const theme of THEMES) {
      test(`${theme}: while the book fades in its pages are paper (never the brown of the cover), and it ends as plain paper`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('folium:theme', t), theme);
        await freezeEntrance(page, 260);
        await page.goto(BOOKS['Code Blocks']);
        await page.waitForFunction(() => (window as unknown as { __frozen?: boolean }).__frozen === true);

        const { paper, desk, leather } = await colours(page);
        const { x, y, opacity } = await paperPoint(page);
        expect(opacity).toBeGreaterThan(0.2); // frozen part-way: the book is there, but still translucent
        expect(opacity).toBeLessThan(1);
        const seen = await pixelAt(page, x, y);
        const expected = mix(parseColour(paper), parseColour(desk), opacity); // paper over the desk, nothing else
        expect(farFrom(seen, expected), `saw ${seen}, wanted about ${expected.map(Math.round)}`).toBeLessThanOrEqual(8);
        // …and it is clearly not the leather showing through
        expect(farFrom(seen, mix(parseColour(leather), parseColour(desk), opacity))).toBeGreaterThan(20);

        // when the animation is over the page is exactly paper
        await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
        await expect(book(page)).not.toHaveClass(/book--entering/);
        const end = await paperPoint(page);
        expect(farFrom(await pixelAt(page, end.x, end.y), parseColour(paper))).toBeLessThanOrEqual(3);
      });
    }

    for (const [name, route] of Object.entries(BOOKS)) {
      test(`${name}: the book is revealed only when it is paginated, with its page numbers, and the loading message is gone`, async ({ page }) => {
        // record the state of the page the first time the book is not hidden
        await page.addInitScript(() => {
          const w = window as unknown as { __revealed?: Record<string, unknown> };
          const check = () => {
            const el = document.querySelector<HTMLElement>('[data-testid="book-sheet"]');
            if (!el || w.__revealed || el.style.visibility === 'hidden') return;
            const prose = el.querySelector<HTMLElement>('.prose');
            const r = el.getBoundingClientRect();
            w.__revealed = {
              pager: document.querySelector('[data-testid="page-indicator"]')?.textContent ?? '',
              columns: prose?.style.columnWidth ?? '',
              pageHeight: prose?.style.getPropertyValue('--page-h') ?? '',
              size: [Math.round(r.width), Math.round(r.height)],
              status: document.querySelectorAll('.reader__status').length,
              busy: document.querySelector('[data-testid="book-content"]')?.getAttribute('aria-busy'),
            };
          };
          new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
        });
        await page.goto(route);
        await page.waitForFunction(() => (window as unknown as { __revealed?: unknown }).__revealed !== undefined);
        const revealed = (await page.evaluate(() => (window as unknown as { __revealed: Record<string, unknown> }).__revealed)) as {
          pager: string;
          columns: string;
          pageHeight: string;
          size: number[];
          status: number;
          busy: string | null;
        };
        expect(revealed.pager).toMatch(/^\d+(–\d+)? \/ \d+$/); // page numbers are there from the first visible frame
        expect(revealed.columns).toMatch(/px$/); // the pages are laid out
        expect(revealed.pageHeight).toMatch(/px$/);
        expect(revealed.size[0]).toBeGreaterThan(200);
        expect(revealed.size[1]).toBeGreaterThan(200);
        expect(revealed.status).toBe(0); // the loading message has already been replaced by the book
        expect(revealed.busy).toBe('false');
        await expect(page.locator('.reader__status')).toHaveCount(0);
      });
    }
  });
}

test.describe('while the book is loading', () => {
  for (const theme of THEMES) {
    test(`${theme}: the desk and a quiet loading message, no book and no brown, until the text arrives`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('folium:theme', t), theme);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      await page.route(/Code(%20| )Blocks/, async (route) => {
        await gate;
        await route.continue();
      });
      await page.goto(BOOKS['Code Blocks']);

      await expect(page.getByRole('status').filter({ hasText: 'Loading book' })).toBeVisible();
      await expect(book(page)).toBeHidden(); // nothing of the book is drawn yet
      expect(await page.locator('.book').count()).toBeLessThanOrEqual(1);

      const { desk } = await colours(page);
      for (const [x, y] of [[200, 300], [640, 650], [1000, 200]]) {
        const seen = await pixelAt(page, x, y);
        expect(farFrom(seen, parseColour(desk)), `at ${x},${y}: ${seen}`).toBeLessThanOrEqual(3); // the desk, not leather
      }

      release();
      await expect(book(page)).toBeVisible();
      await expect(page.locator('.reader__status')).toHaveCount(0);
      await expect(page.getByTestId('page-indicator')).toHaveText(/\d+ \/ \d+/);
    });
  }

  test('a slow image or formula does not show the book half-made: it appears once, complete', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(/KaTeX_.*\.(woff2?|ttf)/, async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(BOOKS['Rich Content (formulas, code)']);
    await page.waitForTimeout(400);
    // the math fonts are still on their way: the pages cannot be measured yet, so the book is not shown
    await expect(book(page)).toBeHidden();
    release();
    await expect(book(page)).toBeVisible();
    await expect(page.getByTestId('page-indicator')).toHaveText(/\d+ \/ \d+/);
    await expect(book(page)).not.toHaveClass(/book--entering/);
  });
});

test.describe('changing books', () => {
  test('opening a different book straight after one: the first is gone at once, and the second appears complete', async ({ page }) => {
    await page.goto(BOOKS.Headings);
    await expect(book(page)).toBeVisible();
    await expect(page.locator('.prose')).toContainText('HEADINGS-BOOK-END');

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(/Code(%20| )Blocks/, async (route) => {
      await gate;
      await route.continue();
    });
    await page.evaluate(() => (location.hash = '#/read/reading/code-blocks'));
    await expect(page.locator('.reader__status')).toBeVisible(); // loading the new one…
    await expect(page.locator('.prose')).toHaveCount(0); // …and nothing of the old one is left behind
    await expect(book(page)).toBeHidden();

    release();
    await expect(book(page)).toBeVisible();
    await expect(page.locator('.prose')).toContainText('CODE-BOOK-END');
    await expect(page.locator('.prose')).not.toContainText('HEADINGS-BOOK-END');
    await expect(page.locator('.reader__status')).toHaveCount(0);
    await expect(page.getByTestId('page-indicator')).toHaveText(/^1(–2)? \/ \d+$/);

    // and back again
    await page.goBack();
    await expect(page.locator('.prose')).toContainText('HEADINGS-BOOK-END');
    await expect(book(page)).toBeVisible();
  });

  test('coming from the cover page: the cover opens, then the book appears on its desk without a flash of leather', async ({ page }) => {
    await freezeEntrance(page, 200);
    await page.goto('/#/book/reading/code-blocks');
    await page.getByTestId('start-reading').click();
    await page.waitForFunction(() => (window as unknown as { __frozen?: boolean }).__frozen === true);
    const { paper, desk } = await colours(page);
    const { x, y, opacity } = await paperPoint(page);
    expect(farFrom(await pixelAt(page, x, y), mix(parseColour(paper), parseColour(desk), opacity))).toBeLessThanOrEqual(8);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the book simply appears: no entrance animation at all, and still no half-made book', async ({ page }) => {
    await page.goto(BOOKS['Code Blocks']);
    await expect(book(page)).toBeVisible();
    await expect(book(page)).not.toHaveClass(/book--entering/);
    expect(await book(page).evaluate((el) => el.getAnimations().length)).toBe(0);
    const { paper } = await colours(page);
    const { x, y } = await paperPoint(page);
    expect(farFrom(await pixelAt(page, x, y), parseColour(paper))).toBeLessThanOrEqual(3);
  });
});
