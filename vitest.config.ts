import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import katexFonts from './tools/vite-plugin-katex-fonts.ts';

export default defineConfig({
  test: {
    projects: [
      {
        // Logic and DOM-structure tests, in jsdom.
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['tests/unit/setup.ts'],
        },
      },
      {
        // Pagination relies on CSS multi-column layout and real measurements, which jsdom cannot
        // do: these tests run in Chromium (through Playwright).
        plugins: [katexFonts()],
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
