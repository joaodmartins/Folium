import { defineConfig, devices } from '@playwright/test';

// `npm run e2e` tests the dev server; `npm run e2e:preview` tests the production build.
const usePreview = process.env.E2E_TARGET === 'preview';
const PORT = usePreview ? 4173 : 5173;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: usePreview
      ? `npm run build && npm run preview -- --port ${PORT} --strictPort`
      : `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
