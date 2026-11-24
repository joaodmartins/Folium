import { expect, test, type Page } from '@playwright/test';

// Interface polish: layout under long titles and small screens, keyboard access, states and errors.
// Runs against tests/fixtures/e2e-library/Polish:
//   Long Title   absurdly long title, author and description (and a table of contents)
//   Bare         no author, no description

const LONG = '/#/book/polish/long-title';
const READ_LONG = '/#/read/polish/long-title';
const THEMES = ['light', 'dark', 'sepia'] as const;

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** WCAG contrast ratio of two CSS colours, computed in the page (the browser resolves any colour syntax). */
async function contrastOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel)!;
    const style = getComputedStyle(node);
    const rgba = (value: string) => {
      const c = document.createElement('canvas').getContext('2d')!;
      c.fillStyle = '#000';
      c.fillStyle = value;
      c.fillRect(0, 0, 1, 1);
      return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const background = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.body).backgroundColor : style.backgroundColor;
    const [a, b] = [luminance(rgba(style.color)), luminance(rgba(background))];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, selector);
}

test.describe('long titles', () => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    test.describe(`at ${viewport.width}px`, () => {
      test.use({ viewport });

      test('the category page, its cards and the cover page never overflow the screen', async ({ page }) => {
        await page.goto('/#/category/polish');
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Polish: a category');
        const cards = page.getByTestId('book-card');
        await expect(cards).toHaveCount(2);
        expect(await noHorizontalOverflow(page)).toBe(true);

        // Cards in one row have the same height, whatever their text.
        const boxes = await cards.evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect()));
        for (const box of boxes) expect(box.width).toBeLessThanOrEqual(viewport.width);
        const rows = new Map<number, number[]>();
        for (const box of boxes) rows.set(Math.round(box.top), [...(rows.get(Math.round(box.top)) ?? []), box.height]);
        for (const heights of rows.values()) expect(new Set(heights.map(Math.round)).size).toBe(1);

        await page.goto(LONG);
        await expect(page.getByRole('heading', { level: 1 })).toContainText('absurdly long book title');
        await expect(page.getByTestId('start-reading')).toBeVisible();
        expect(await noHorizontalOverflow(page)).toBe(true);
        // The printed cover keeps its text inside the cover.
        const overflow = await page.evaluate(() => {
          const print = document.querySelector('.book-cover__print')!;
          return print.scrollHeight - print.clientHeight;
        });
        expect(overflow).toBeLessThanOrEqual(1);
      });

      test('the home page and the reader do not overflow either', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByTestId('logo')).toBeVisible();
        expect(await noHorizontalOverflow(page)).toBe(true);

        await page.goto(READ_LONG);
        await expect(page.getByTestId('book-sheet')).toBeVisible();
        expect(await noHorizontalOverflow(page)).toBe(true);
      });
    });
  }
});

test.describe('missing details', () => {
  test('a book without a description still has a complete cover page and card', async ({ page }) => {
    await page.goto('/#/category/polish');
    const card = page.getByTestId('book-card').filter({ hasText: 'Bare' });
    await expect(card.locator('.card__text')).toHaveCount(0);
    await card.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Bare' })).toBeVisible();
    await expect(page.locator('.cover-view__description')).toHaveCount(0);
    await expect(page.getByTestId('start-reading')).toBeVisible();
  });
});

test.describe('states and errors', () => {
  test('a missing book says so and offers the way back, including the nearest category', async ({ page }) => {
    await page.goto('/#/book/polish/not-a-book');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await expect(page.getByText(/This book does not exist/)).toBeVisible();
    await page.getByRole('link', { name: /^Browse Polish/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Polish: a category');
  });

  test('an invalid route and a missing category are explained too', async ({ page }) => {
    await page.goto('/#/nonsense');
    await expect(page.getByText('There is nothing at this address.')).toBeVisible();
    await page.goto('/#/category/nowhere');
    await expect(page.getByText(/This category does not exist/)).toBeVisible();
    await page.getByRole('link', { name: /^Back to / }).click();
    await expect(page.getByTestId('logo')).toBeVisible();
  });

  test('when a book cannot be loaded the reader offers a retry and a way back', async ({ page }) => {
    await page.route(/Long(%20| )Title/, (route) => route.abort());
    await page.goto(READ_LONG);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('We could not load');
    await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
    await alert.getByRole('link', { name: /^Back to / }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Polish: a category');
  });
});

test.describe('keyboard and screen readers', () => {
  test('the first Tab stop is a skip link that moves focus to the content without changing the route', async ({ page }) => {
    await page.goto('/#/category/polish');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    expect(page.url()).toContain('#/category/polish');
  });

  test('the theme can be chosen from the library pages with the keyboard, and is kept in the reader', async ({ page }) => {
    await page.goto('/#/category/polish');
    const dark = page.getByTestId('theme-dark');
    await dark.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(dark).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/#/read/polish/bare');
    await expect(page.getByTestId('book-sheet')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-pressed', 'true');
  });

  test('every interactive control shows a visible focus indicator', async ({ page }) => {
    await page.goto('/#/category/polish');
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const outline = await page.evaluate(() => {
        const style = getComputedStyle(document.activeElement!);
        return { tag: document.activeElement!.outerHTML.slice(0, 80), style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      expect(outline.style, `tab stop ${i + 1}: ${outline.tag}`).not.toBe('none');
      expect(outline.width).toBeGreaterThanOrEqual(2);
    }
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 700 } });

    test('the reader keeps accessible names for its icon-only controls', async ({ page }) => {
      await page.goto('/#/read/polish/bare');
      await expect(page.getByTestId('book-sheet')).toBeVisible();
      await expect(page.getByTestId('back-link')).toHaveAccessibleName('Polish: a category with a deliberately very long title that has to wrap or be cut without breaking the grid');
      await expect(page.getByTestId('next-page')).toHaveAccessibleName('Next page');
      await expect(page.getByTestId('theme-dark')).toHaveAccessibleName('Dark theme');
    });

    test('the cover page shows the way back instead of the full breadcrumb trail', async ({ page }) => {
      await page.goto(LONG);
      await expect(page.getByTestId('back-link')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeHidden();
    });
  });
});

test.describe('the three themes', () => {
  for (const theme of THEMES) {
    test(`${theme}: primary buttons and text are readable`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('folium:theme', t), theme);
      await page.goto('/#/book/polish/bare');
      await expect(page.getByTestId('start-reading')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await contrastOf(page, '[data-testid="start-reading"]')).toBeGreaterThanOrEqual(4.5);
      expect(await contrastOf(page, '.cover-view__title')).toBeGreaterThanOrEqual(4.5);
      expect(await contrastOf(page, '.site-bar__brand')).toBeGreaterThanOrEqual(4.5);
      // The browser draws native controls and scrollbars to match.
      const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
      expect(scheme).toBe(theme === 'dark' ? 'dark' : 'light');
    });
  }
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('opening a book from its cover page is a plain navigation', async ({ page }) => {
    await page.goto('/#/book/polish/bare');
    await page.getByTestId('start-reading').click();
    await expect(page.getByTestId('book-sheet')).toBeVisible();
    expect(page.url()).toContain('#/read/polish/bare');
  });
});
