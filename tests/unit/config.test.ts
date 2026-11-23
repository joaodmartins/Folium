import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, loadFolderConfig, loadGlobalConfig } from '../../tools/vite-plugin-folium/config';
import type { Issue } from '../../tools/vite-plugin-folium/types';
import { FIXTURE_CONFIG, makeProject } from './helpers';

function loadGlobal(content: string | null) {
  const root = makeProject(content === null ? {} : { 'folium.config.json': content });
  const issues: Issue[] = [];
  const config = loadGlobalConfig(join(root, 'folium.config.json'), 'folium.config.json', issues);
  return { config, issues };
}

function loadFolder(content: string) {
  const root = makeProject({ '_folder.json': content });
  const issues: Issue[] = [];
  const config = loadFolderConfig(join(root, '_folder.json'), 'Library/_folder.json', issues);
  return { config, issues };
}

describe('global config (folium.config.json)', () => {
  it('reads a valid config', () => {
    const issues: Issue[] = [];
    const config = loadGlobalConfig(FIXTURE_CONFIG, 'folium.config.json', issues);
    expect(issues).toEqual([]);
    expect(config).toEqual({
      title: 'Fixture Library',
      tagline: 'Used by the unit tests',
      defaultTheme: 'sepia',
      defaults: { author: 'Global Author', language: 'en', showTableOfContents: false, chapterBreak: 'h2' },
    });
  });

  it('falls back to built-in defaults when the file does not exist', () => {
    const { config, issues } = loadGlobal(null);
    expect(issues).toEqual([]);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('fills missing values with built-in defaults', () => {
    const { config, issues } = loadGlobal('{ "title": "Mine" }');
    expect(issues).toEqual([]);
    expect(config.title).toBe('Mine');
    expect(config.defaultTheme).toBe('light');
    expect(config.defaults).toEqual(DEFAULT_CONFIG.defaults);
  });

  it('reports malformed JSON with a clear message and uses defaults', () => {
    const { config, issues } = loadGlobal('{ "title": ');
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'error', file: 'folium.config.json' });
    expect(issues[0].message).toContain('Invalid JSON');
  });

  it('rejects a config that is not an object', () => {
    const { issues } = loadGlobal('[1, 2]');
    expect(issues[0].message).toContain('JSON object');
  });

  it('reports invalid values and unknown keys', () => {
    const { config, issues } = loadGlobal(
      JSON.stringify({
        title: 5,
        defaultTheme: 'neon',
        colour: 'red',
        defaults: { chapterBreak: 'h9', language: '', unknown: true },
      }),
    );
    const messages = issues.map((i) => i.message).join('\n');
    expect(issues.every((i) => i.level === 'error')).toBe(true);
    expect(messages).toContain('"title"');
    expect(messages).toContain('"defaultTheme"');
    expect(messages).toContain('"colour"');
    expect(messages).toContain('"chapterBreak"');
    expect(messages).toContain('"language"');
    expect(messages).toContain('"unknown"');
    expect(config.title).toBe(DEFAULT_CONFIG.title);
    expect(config.defaultTheme).toBe('light');
  });

  it('rejects "defaults" that is not an object', () => {
    const { issues } = loadGlobal('{ "defaults": "en" }');
    expect(issues[0].message).toContain('"defaults" must be an object');
  });
});

describe('folder config (_folder.json)', () => {
  it('reads a valid folder config', () => {
    const { config, issues } = loadFolder(
      '{ "title": "Russian", "description": "d", "cover": "c.png", "order": 1, "defaults": { "language": "ru" } }',
    );
    expect(issues).toEqual([]);
    expect(config).toEqual({
      title: 'Russian',
      description: 'd',
      cover: 'c.png',
      order: 1,
      defaults: { language: 'ru' },
    });
  });

  it('returns an empty config when the file does not exist', () => {
    const issues: Issue[] = [];
    expect(loadFolderConfig(join(makeProject({}), '_folder.json'), 'x', issues)).toEqual({ defaults: {} });
    expect(issues).toEqual([]);
  });

  it('reports typos instead of silently ignoring them', () => {
    const { issues } = loadFolder('{ "defualts": { "language": "ru" }, "order": "first" }');
    const messages = issues.map((i) => i.message).join('\n');
    expect(messages).toContain('"defualts"');
    expect(messages).toContain('"order"');
  });

  it('does not allow per-book fields such as title or draft in "defaults"', () => {
    const { issues } = loadFolder('{ "defaults": { "title": "x", "draft": true } }');
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.level === 'error')).toBe(true);
  });
});
