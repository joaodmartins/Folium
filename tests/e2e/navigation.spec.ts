import { expect, test, type Page } from '@playwright/test';

// These tests run against the real Library/ (examples: Languages/Russian/A1/Alphabet.md and
// University/Operating Systems/Theory/Lesson 1.md), so they also prove the manifest is wired in.

const h1 = (page: Page) => page.getByRole('heading', { level: 1 });
const breadcrumbs = (page: Page) => page.getByRole('navigation', { name: 'Breadcrumb' });

test.describe('home', () => {
  test('is generated from the real manifest, without placeholder content', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Folium');
    await expect(page.getByTestId('logo')).toContainText('Folium');
    await expect(page.getByText('Your personal digital library')).toBeVisible();

    const cards = page.getByTestId('category-card');
    await expect(cards.filter({ hasText: 'Languages' })).toBeVisible();
    await expect(cards.filter({ hasText: 'University' })).toBeVisible();
    await expect(page.getByText(/placeholder/i)).toHaveCount(0);
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
  });

  test('shows recursive book counts on category cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('category-card').filter({ hasText: 'Languages' })).toContainText(/\d+ books?/);
  });
});

test.describe('navigation', () => {
  test('home → Languages → Russian → A1 → Alphabet, then back and forward', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('category-card').filter({ hasText: 'Languages' }).click();
    await expect(page).toHaveURL(/#\/category\/languages$/);
    await expect(h1(page)).toHaveText('Languages');
    await expect(page).toHaveTitle('Languages · Folium');

    await page.getByTestId('category-card').filter({ hasText: 'Russian' }).click();
    await expect(page).toHaveURL(/#\/category\/languages\/russian$/);
    await expect(h1(page)).toHaveText('Russian');

    await page.getByTestId('category-card').filter({ hasText: 'A1' }).click();
    await expect(page).toHaveURL(/#\/category\/languages\/russian\/a1$/);
    await expect(h1(page)).toHaveText('A1');

    await page.getByTestId('book-card').filter({ hasText: 'Russian Alphabet' }).click();
    await expect(page).toHaveURL(/#\/book\/languages\/russian\/a1\/alphabet$/);
    await expect(h1(page)).toHaveText('Russian Alphabet');
    await expect(page).toHaveTitle('Russian Alphabet · Folium');
    // a book opens on its cover, not on its text
    await expect(page.getByTestId('book-cover')).toBeVisible();
    await expect(page.getByTestId('book-content')).toHaveCount(0);
    await expect(page.locator('.page__lead')).toContainText('the Cyrillic alphabet');

    // Back button: book → A1 → Russian
    await page.goBack();
    await expect(page).toHaveURL(/#\/category\/languages\/russian\/a1$/);
    await expect(h1(page)).toHaveText('A1');
    await page.goBack();
    await expect(page).toHaveURL(/#\/category\/languages\/russian$/);
    await expect(h1(page)).toHaveText('Russian');

    // Forward button: Russian → A1
    await page.goForward();
    await expect(page).toHaveURL(/#\/category\/languages\/russian\/a1$/);
    await expect(h1(page)).toHaveText('A1');
  });

  test('navigates without reloading the page', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => ((window as unknown as { __marker: string }).__marker = 'still here'));
    await page.getByTestId('category-card').filter({ hasText: 'University' }).click();
    await expect(h1(page)).toHaveText('University');
    expect(await page.evaluate(() => (window as unknown as { __marker?: string }).__marker)).toBe('still here');
  });

  test('breadcrumbs show every level and link back up', async ({ page }) => {
    await page.goto('/#/book/languages/russian/a1/alphabet');
    const crumbs = breadcrumbs(page);
    await expect(crumbs.getByRole('listitem')).toHaveText(['Folium', 'Languages', 'Russian', 'A1', 'Russian Alphabet']);
    await expect(crumbs.getByText('Russian Alphabet')).toHaveAttribute('aria-current', 'page');

    await crumbs.getByRole('link', { name: 'Russian', exact: true }).click();
    await expect(page).toHaveURL(/#\/category\/languages\/russian$/);
    await expect(h1(page)).toHaveText('Russian');

    await breadcrumbs(page).getByRole('link', { name: 'Folium' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByTestId('logo')).toBeVisible();
  });

  test('the book page links back to its category', async ({ page }) => {
    await page.goto('/#/book/university/operating-systems/theory/lesson-1');
    await expect(h1(page)).toHaveText('Operating Systems - Lesson 1');
    await page.getByTestId('category-link').click();
    await expect(page).toHaveURL(/#\/category\/university\/operating-systems\/theory$/);
  });
});

test.describe('deep links and invalid routes', () => {
  test('opens a deep link directly', async ({ page }) => {
    await page.goto('/#/category/university/operating-systems');
    await expect(h1(page)).toHaveText('Operating Systems');
    await expect(breadcrumbs(page).getByRole('listitem')).toHaveText(['Folium', 'University', 'Operating Systems']);
  });

  for (const route of ['#/nope', '#/category/does/not/exist', '#/book/languages/russian', '#/category']) {
    test(`shows a not-found page for ${route}`, async ({ page }) => {
      await page.goto(`/${route}`);
      await expect(h1(page)).toHaveText('Page not found');
      await expect(page.getByTestId('missing-route')).toHaveText(route);
      await page.getByRole('link', { name: /Back to Folium/ }).click();
      await expect(page).toHaveURL(/#\/$/);
      await expect(page.getByTestId('logo')).toBeVisible();
    });
  }

  test('recovers from a not-found page with the back button', async ({ page }) => {
    await page.goto('/');
    await page.goto('/#/nope');
    await expect(h1(page)).toHaveText('Page not found');
    await page.goBack();
    await expect(page.getByTestId('logo')).toBeVisible();
  });
});

test.describe('responsive layout', () => {
  test('works on a phone-sized viewport without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    for (const route of ['/', '/#/category/languages/russian/a1', '/#/book/languages/russian/a1/alphabet']) {
      await page.goto(route);
      await expect(h1(page)).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, route).toBeLessThanOrEqual(0);
    }
  });
});
