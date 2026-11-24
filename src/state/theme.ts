import type { ThemeName } from '../../tools/vite-plugin-folium/types';

export type Theme = ThemeName;
export const THEMES: readonly Theme[] = ['light', 'dark', 'sepia'];

const STORAGE_KEY = 'folium:theme';

export const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);

/** `localStorage` can be missing or throw (private windows, blocked site data): never rely on it. */
function storageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The saved theme, or `fallback` (the library's default theme) when there is none or it is invalid. */
export function loadTheme(fallback: Theme, storage: Storage | null = storageOrNull()): Theme {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    return isTheme(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
}

export function saveTheme(theme: Theme, storage: Storage | null = storageOrNull()): void {
  try {
    storage?.setItem(STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this visit.
  }
}

/** Themes only change colours (see tokens.css), so applying one never changes how a book is paginated. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.setAttribute('data-theme', theme);
  // Tint the browser's own chrome (mobile address bar) to match the page.
  root.ownerDocument.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

/** Page background of each theme (`--bg` in tokens.css), for `<meta name="theme-color">`. */
const THEME_COLORS: Record<Theme, string> = { light: '#f6f3ee', dark: '#16151a', sepia: '#efe4cd' };

export function currentTheme(root: HTMLElement = document.documentElement): Theme {
  const value = root.getAttribute('data-theme');
  return isTheme(value) ? value : 'light';
}

/** Applies and remembers a theme in one step (what the theme control calls). */
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  saveTheme(theme);
}
