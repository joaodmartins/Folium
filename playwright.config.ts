import { defineConfig, devices } from '@playwright/test';

// `npm run e2e` tests the dev server; `npm run e2e:preview` tests the production build.
const usePreview = process.env.E2E_TARGET === 'preview';
const MAIN_PORT = usePreview ? 4173 : 5173;
const FIXTURE_PORT = usePreview ? 4174 : 5174;
const FIXTURE_LIBRARY = 'tests/fixtures/e2e-library';

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${MAIN_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      // The real Library/ (the example books).
      name: 'chromium',
      testIgnore: /\.fixture\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // A separate app instance whose library is tests/fixtures/e2e-library: books written to
      // stress pagination (known page counts, huge images, long code...) without touching Library/.
      name: 'fixtures',
      testMatch: /\.fixture\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${FIXTURE_PORT}` },
    },
  ],
  webServer: [
    {
      command: usePreview
        ? `npm run build && npm run preview -- --port ${MAIN_PORT} --strictPort`
        : `npm run dev -- --port ${MAIN_PORT} --strictPort`,
      url: `http://localhost:${MAIN_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: usePreview
        ? `npm run build -- --outDir dist-e2e && npm run preview -- --outDir dist-e2e --port ${FIXTURE_PORT} --strictPort`
        : `npm run dev -- --port ${FIXTURE_PORT} --strictPort`,
      env: { FOLIUM_LIBRARY: FIXTURE_LIBRARY },
      url: `http://localhost:${FIXTURE_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
