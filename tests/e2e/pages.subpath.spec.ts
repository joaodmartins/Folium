import { expect, test, type Page } from '@playwright/test';

// The site is published at https://joaodmartins.github.io/Folium/ (a sub-path, not the root of a domain).
// These tests serve the production build under /Folium/ (see playwright.config.ts) and check that nothing
// depends on being at the root: every request must stay under /Folium/ and succeed. (A request for "/assets/…"
// would work on localhost and fail on GitHub Pages.)

const LESSON = '#/read/university/operating-systems/theory/lesson2';

/** Records every request to the site's own origin that is not under /Folium/, and every failed one. */
function watch(page: Page) {
  const problems: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'localhost' && !url.pathname.startsWith('/Folium/')) problems.push(`outside /Folium/: ${url.pathname}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  return { problems, errors };
}

const reader = async (page: Page) => {
  await expect(page.getByTestId('book-sheet')).toBeVisible();
  await expect(page.getByTestId('page-indicator')).toHaveText(/^\d+(–\d+)? \/ \d+$/);
  await expect(page.getByTestId('book-sheet')).not.toHaveClass(/book--entering/);
};

test('the home page, categories at any depth and their refresh work under /Folium/', async ({ page }) => {
  const seen = watch(page);
  await page.goto('./');
  await expect(page.getByTestId('logo')).toBeVisible();
  await expect(page.getByTestId('category-card').first()).toBeVisible();

  await page.goto('./#/category/university/operating-systems/theory');
  await expect(page.getByTestId('book-card').first()).toBeVisible();
  await page.reload(); // a refresh on a deep route must not need any server-side rewrite
  await expect(page.getByTestId('book-card').first()).toBeVisible();

  await page.getByTestId('book-card').first().click(); // navigation by hash
  await expect(page).toHaveURL(/#\/book\//);
  await page.goto('./#/nowhere');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  expect(seen.problems).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test('a book loads from /Folium/: its chunk, images, highlighting, theme and reading progress', async ({ page }) => {
  const seen = watch(page);
  await page.goto(`./${LESSON}`);
  await reader(page);

  // images relative to the Markdown file are served from under /Folium/
  const images = await page.locator('.prose img').evaluateAll((nodes) => nodes.map((n) => ({ src: (n as HTMLImageElement).src, loaded: (n as HTMLImageElement).complete && (n as HTMLImageElement).naturalWidth > 0 })));
  expect(images.length).toBeGreaterThan(0);
  for (const image of images) {
    expect(new URL(image.src).pathname.startsWith('/Folium/')).toBe(true);
    expect(image.loaded, image.src).toBe(true);
  }
  expect(await page.locator('.prose .hljs-type, .prose .hljs-keyword').count()).toBeGreaterThan(0); // highlight.js

  // the reading position and the theme are kept across a refresh
  await page.getByTestId('page-current').click();
  await page.getByTestId('page-input').fill('7');
  await page.keyboard.press('Enter');
  await page.getByTestId('theme-sepia').click();
  await page.reload();
  await reader(page);
  await expect(page.getByTestId('page-indicator')).toHaveText(/^7(–8)? \//);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  expect(seen.problems).toEqual([]);
  expect(seen.errors).toEqual([]);
});

test('the math fonts (KaTeX) of the stylesheet are all served from /Folium/', async ({ page, request }) => {
  await page.goto('./');
  const sheet = await page.locator('link[rel="stylesheet"]').first().getAttribute('href');
  const sheetUrl = new URL(sheet!, page.url());
  expect(sheetUrl.pathname.startsWith('/Folium/')).toBe(true);
  const css = await (await request.get(sheetUrl.href)).text();
  const fonts = [...css.matchAll(/url\((\.\/KaTeX_[^)]+\.woff2)\)/g)].map((m) => new URL(m[1], sheetUrl).href);
  expect(fonts.length).toBeGreaterThan(10);
  for (const font of fonts) {
    const response = await request.get(font);
    expect(response.status(), font).toBe(200);
    expect(new URL(font).pathname.startsWith('/Folium/')).toBe(true);
  }
});

test('index.html asks for its script and stylesheet with relative URLs', async ({ request }) => {
  const html = await (await request.get('./')).text();
  expect(html).toMatch(/src="\.\/assets\/[^"]+\.js"/);
  expect(html).toMatch(/href="\.\/assets\/[^"]+\.css"/);
  expect(html).not.toMatch(/(src|href)="\/(?!\/)/); // no absolute path at the root of the domain
});
