// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, currentTheme, isTheme, loadTheme, saveTheme, setTheme, THEMES } from '../../src/state/theme';

/** A minimal Storage. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  vi.restoreAllMocks();
});

describe('themes', () => {
  it('there are three: light, dark and sepia', () => {
    expect(THEMES).toEqual(['light', 'dark', 'sepia']);
    expect(THEMES.every(isTheme)).toBe(true);
    expect(isTheme('neon')).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });

  it('applies a theme to the document (colours only: it is just an attribute)', () => {
    for (const theme of THEMES) {
      applyTheme(theme);
      expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
      expect(currentTheme()).toBe(theme);
    }
  });

  it('reports light when nothing valid is set', () => {
    expect(currentTheme()).toBe('light');
    document.documentElement.setAttribute('data-theme', 'bogus');
    expect(currentTheme()).toBe('light');
  });

  it('remembers the choice between visits', () => {
    const storage = fakeStorage();
    expect(loadTheme('light', storage)).toBe('light');
    saveTheme('sepia', storage);
    expect(loadTheme('light', storage)).toBe('sepia');
    saveTheme('dark', storage);
    expect(loadTheme('light', storage)).toBe('dark');
  });

  it('falls back to the library default when the stored value is not a theme', () => {
    expect(loadTheme('sepia', fakeStorage({ 'folium:theme': 'neon' }))).toBe('sepia');
    expect(loadTheme('dark', fakeStorage({ 'folium:theme': '' }))).toBe('dark');
  });

  it('setTheme applies it and saves it in localStorage', () => {
    setTheme('dark');
    expect(currentTheme()).toBe('dark');
    expect(window.localStorage.getItem('folium:theme')).toBe('dark');
    expect(loadTheme('light')).toBe('dark');
  });

  it('works when storage is unavailable or throws (private windows, blocked site data)', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(loadTheme('sepia', broken)).toBe('sepia');
    expect(() => saveTheme('dark', broken)).not.toThrow();
    expect(loadTheme('light', null)).toBe('light');
    expect(() => saveTheme('dark', null)).not.toThrow();

    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => setTheme('dark')).not.toThrow();
    expect(currentTheme()).toBe('dark'); // still applied for this visit
  });
});
