import { expect, test, type Locator, type Page } from '@playwright/test';

// Runs against the real Library/ examples:
//   Languages/Russian/A1/Alphabet.md  (headings, table, list)
//   University/Operating Systems/Theory/Lesson 1.md  (code block, relative image)

const ALPHABET = '/#/book/languages/russian/a1/alphabet';
const LESSON = '/#/book/university/operating-systems/theory/lesson-1';

const content = (page: Page) => page.getByTestId('book-content');

/** True when some part of the element (any of its boxes, if it spans pages) is in the visible page window. */
const onScreen = (element: Locator) =>
  element.first().evaluate((el) => {
    const view = document.querySelector('.book__clip')!.getBoundingClientRect();
    return [...el.getClientRects()].some((r) => r.width > 0 && r.right > view.left + 1 && r.left < view.right - 1);
  });

/** Clicks a page button and waits for the page-turn animation to finish. */
async function turn(page: Page, button: Locator) {
  await button.click();
  await page.locator('.book__pages').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined))));
}

/** Starts from the first page and turns pages until the element is on screen. */
async function showPageWith(page: Page, element: Locator) {
  const prev = page.getByTestId('prev-page');
  const next = page.getByTestId('next-page');
  await expect(page.getByTestId('page-indicator')).toHaveText(/^\d+ \/ \d+$/); // the book is paginated and ready
  while (!(await prev.isDisabled())) await turn(page, prev);
  for (let i = 0; i < 30 && !(await onScreen(element)); i++) {
    if (await next.isDisabled()) break;
    await turn(page, next);
  }
  expect(await onScreen(element)).toBe(true);
}
async function expectInsideScreen(element: Locator, width: number) {
  await expect
    .poll(async () => {
      const box = (await element.first().boundingBox())!;
      return box.x >= 0 && box.x + box.width <= width;
    })
    .toBe(true);
}
const isPreview = process.env.E2E_TARGET === 'preview';

test.describe('reading a book', () => {
  test('home → Languages → Russian → A1 → Alphabet shows the rendered Markdown', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('category-card').filter({ hasText: 'Languages' }).click();
    await page.getByTestId('category-card').filter({ hasText: 'Russian' }).click();
    await page.getByTestId('category-card').filter({ hasText: 'A1' }).click();
    await page.getByTestId('book-card').filter({ hasText: 'Russian Alphabet' }).click();

    const prose = content(page).locator('.prose');
    await expect(prose).toBeVisible();
    await expect(content(page).getByText('Loading book…')).toHaveCount(0);

    // Markdown became real elements, not raw text
    await expect(prose.getByRole('heading', { level: 2, name: 'Overview' })).toBeVisible();
    await expect(prose.getByRole('heading', { level: 2, name: 'Study tips' })).toBeVisible();
    await expect(prose).not.toContainText('## Overview');
    await expect(prose).not.toContainText('title: Russian Alphabet'); // frontmatter is not shown

    await expect(prose.getByRole('table')).toBeVisible();
    await expect(prose.getByRole('columnheader')).toHaveText(['Letter', 'Name', 'Sound']);
    await expect(prose.getByRole('cell', { name: 'Б б' })).toBeVisible();
    await expect(prose.getByRole('listitem')).toHaveCount(4);
    await expect(prose.locator('em').first()).toBeVisible();
    await expect(prose).toContainText('Cyrillic'); // Unicode text

    // Only one visible level-1 heading: the page header's (the content's duplicate H1 is hidden)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Russian Alphabet');
  });

  test('headings are visually distinct and sized by level', async ({ page }) => {
    await page.goto(ALPHABET);
    const h2 = content(page).getByRole('heading', { level: 2, name: 'Overview' });
    await expect(h2).toBeVisible();
    const sizes = await page.evaluate(() => {
      const size = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : 0);
      const root = document.querySelector('.prose')!;
      return { h2: size(root.querySelector('h2')), p: size(root.querySelector('p')) };
    });
    expect(sizes.h2).toBeGreaterThan(sizes.p);
  });

  test('code blocks are rendered as monospace blocks', async ({ page }) => {
    await page.goto(LESSON);
    const code = content(page).locator('pre code.language-c');
    await expect(code).toBeVisible();
    await expect(code).toContainText('pid_t pid = fork();');
    await expect(code).toContainText('#include <stdio.h>'); // special characters survive
    await expect(content(page).locator('p code').first()).toHaveText('fork()'); // inline code

    const style = await code.evaluate((el) => {
      const pre = el.parentElement!;
      return { font: getComputedStyle(el).fontFamily, white: getComputedStyle(el).whiteSpace, bg: getComputedStyle(pre).backgroundColor };
    });
    expect(style.font).toMatch(/mono|consolas|menlo/i);
    expect(style.white).toMatch(/^pre/); // pages do not scroll sideways, so long lines wrap ("pre-wrap")
    expect(style.bg).not.toBe('rgba(0, 0, 0, 0)'); // highlighted block
  });

  test('relative images are resolved from the Markdown file and load', async ({ page }) => {
    await page.goto(LESSON);
    const img = content(page).getByRole('img', { name: /fork\(\) creates a child process/ });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);

    // The URL comes from the app's asset map (a hashed file, or an inlined data URI for tiny files like this
    // SVG), not from the page-relative "images/fork.svg" written in the Markdown.
    const src = (await img.getAttribute('src'))!;
    expect(src).toMatch(/^(data:image\/svg\+xml[;,]|.*fork.*\.svg$)/);
    expect(src).not.toBe('images/fork.svg');

    const box = (await img.boundingBox())!;
    const proseBox = (await content(page).locator('.prose').boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(proseBox.width + 1);
  });

  test('anchors open a book at the page of a heading', async ({ page }) => {
    await page.goto(`${LESSON}#creating-a-process`);
    const heading = content(page).getByRole('heading', { name: 'Creating a process' });
    await expect(heading).toBeInViewport(); // the page with the heading is the one shown
    await expect(page.getByRole('heading', { level: 1, name: /not found/i })).toHaveCount(0);

    // moving to another heading of the open book turns to its page without rebuilding the book
    await page.evaluate(() => ((window as unknown as { __prose: Element }).__prose = document.querySelector('.prose')!));
    await page.evaluate(() => (location.hash = '#/book/university/operating-systems/theory/lesson-1#what-is-an-operating-system'));
    await expect(content(page).getByRole('heading', { name: 'What is an operating system?' })).toBeInViewport();
    expect(
      await page.evaluate(() => (window as unknown as { __prose: Element }).__prose === document.querySelector('.prose')),
    ).toBe(true);
  });
});

test.describe('switching books', () => {
  test('opening another book does not keep the previous content', async ({ page }) => {
    await page.goto(ALPHABET);
    await expect(content(page)).toContainText('Study tips');

    await page.evaluate(() => (location.hash = '#/book/university/operating-systems/theory/lesson-1'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Operating Systems - Lesson 1');
    await expect(content(page).locator('pre code')).toBeVisible();
    await expect(content(page)).not.toContainText('Study tips');
    await expect(content(page)).not.toContainText('Cyrillic');
    await expect(content(page).getByRole('table')).toHaveCount(0);

    await page.goBack(); // and back again: the first book's content, not the second's
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Russian Alphabet');
    await expect(content(page)).toContainText('Study tips');
    await expect(content(page).locator('pre code')).toHaveCount(0);
  });

  test('a slow book never overwrites the book opened after it', async ({ page }) => {
    // Delay only the first book's content, then open the second one.
    await page.route(/Alphabet/, async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await page.goto('/');
    await page.evaluate(() => (location.hash = '#/book/languages/russian/a1/alphabet'));
    await expect(content(page).getByText('Loading book…')).toBeVisible();
    await page.evaluate(() => (location.hash = '#/book/university/operating-systems/theory/lesson-1'));
    await expect(content(page).locator('pre code')).toBeVisible();

    await page.waitForTimeout(1200); // the delayed book has had time to arrive
    await expect(content(page)).not.toContainText('Study tips');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Operating Systems - Lesson 1');
  });

  test('content is loaded lazily: the home page does not fetch any book', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/');
    await expect(page.getByTestId('logo')).toBeVisible();
    expect(requests.filter((url) => /Alphabet|Lesson(%20| )1/.test(url))).toEqual([]);

    await page.goto(ALPHABET);
    await expect(content(page).locator('.prose')).toBeVisible();
    expect(requests.some((url) => /Alphabet/.test(url))).toBe(true);
  });
});

test.describe('loading errors', () => {
  test('shows an understandable message and recovers with "Try again"', async ({ page }) => {
    await page.route(/Alphabet/, (route) => route.abort());
    await page.goto(ALPHABET);

    const alert = content(page).getByRole('alert');
    await expect(alert).toContainText('We could not load “Russian Alphabet”');
    await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Russian Alphabet'); // the page itself still works

    await page.unroute(/Alphabet/);
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(content(page).locator('.prose')).toBeVisible();
    await expect(content(page).getByRole('alert')).toHaveCount(0);
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  for (const [name, route] of [['Alphabet', ALPHABET], ['Lesson 1', LESSON]] as const) {
    test(`${name} fits a phone screen without horizontal scrolling`, async ({ page }) => {
      await page.goto(route);
      await expect(content(page).locator('.prose')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      const prose = (await content(page).locator('.prose').boundingBox())!;
      expect(prose.width).toBeGreaterThan(300);
      expect(prose.width).toBeLessThanOrEqual(375);
    });
  }

  test('images, code and tables stay inside the screen (code and tables wrap instead of scrolling)', async ({ page }) => {
    await page.goto(LESSON);
    const img = content(page).getByRole('img');
    await showPageWith(page, img);
    await expectInsideScreen(img, 375); // (polls: the page may still be sliding into place)

    const pre = content(page).locator('pre');
    await showPageWith(page, pre);
    expect(await pre.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

    await page.goto(ALPHABET);
    const table = content(page).getByRole('table');
    await expect(table).toBeAttached(); // the new book replaced the previous one (same document: only the hash changed)
    await showPageWith(page, table);
    await expectInsideScreen(table, 375);
  });
});

test.describe('security in a real browser', () => {
  test('a malicious book cannot run code or inject active content', async ({ page }) => {
    test.skip(isPreview, 'imports the source module, which only exists on the dev server');
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const path = '/src/reader/render.ts';
      const { renderMarkdown } = await import(/* @vite-ignore */ path);
      const w = window as unknown as { __pwned?: boolean };
      const payload = [
        '<img src=x onerror="window.__pwned=true">',
        '<script>window.__pwned=true</script>',
        '<svg onload="window.__pwned=true"></svg>',
        '[x](javascript:window.__pwned=true)',
        '<a href="javascript:window.__pwned=true">y</a>',
        '<iframe src="javascript:window.__pwned=true"></iframe>',
        '<div onmouseover="window.__pwned=true" style="position:fixed;inset:0">hover</div>',
        '<form action="https://evil.example"><input name="pw"></form>',
        '<noscript><p title="</noscript><img src=x onerror=window.__pwned=true>">',
      ].join('\n\n');
      const { element } = renderMarkdown(payload, {
        title: 'x', bookId: 'x', bookPath: 'x.md', findBookByPath: () => undefined, assetUrl: () => undefined,
      });
      document.body.append(element);
      await new Promise((r) => setTimeout(r, 300)); // give an onerror handler time to fire
      const dangerous = element.querySelectorAll('script, iframe, form, input, svg, [onerror], [onload], [onmouseover], [style]').length;
      const jsLinks = [...element.querySelectorAll('[href],[src]')].filter((e) => /^\s*javascript:/i.test(e.getAttribute('href') ?? e.getAttribute('src') ?? '')).length;
      return { pwned: w.__pwned === true, dangerous, jsLinks };
    });
    expect(result).toEqual({ pwned: false, dangerous: 0, jsLinks: 0 });
  });
});
