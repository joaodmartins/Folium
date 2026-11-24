import { afterEach } from 'vitest';

// Progress and the theme live in localStorage: no test may see what another one saved.
afterEach(() => {
  try {
    globalThis.localStorage?.clear();
  } catch {
    // (a test that makes storage throw restores it itself)
  }
});
