import { expect, test } from '@playwright/test';

test('landing page renders the Folium identity', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Folium');
  await expect(page.getByTestId('logo')).toContainText('Folium');
  await expect(page.getByText('Your personal digital library')).toBeVisible();
});
