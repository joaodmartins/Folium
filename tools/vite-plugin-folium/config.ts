import { existsSync, readFileSync } from 'node:fs';
import type { BookDefaults, FolderConfig, FolderDefaults, FoliumConfig, Issue } from './types.ts';
import { isPlainObject, readFields, type FieldSpec } from './validate.ts';

export const DEFAULT_CONFIG: FoliumConfig = {
  title: 'Folium',
  defaultTheme: 'light',
  defaults: {
    language: 'en',
    showTableOfContents: false,
    chapterBreak: 'h1',
  },
};

/** Book settings that may be inherited (global config and `_folder.json` "defaults"). */
const DEFAULTS_FIELDS: Record<string, FieldSpec> = {
  author: 'string',
  language: 'string',
  showTableOfContents: 'boolean',
  chapterBreak: ['h1', 'h2', 'none'],
};

const GLOBAL_FIELDS: Record<string, FieldSpec> = {
  title: 'string',
  tagline: 'string',
  defaultTheme: ['light', 'dark', 'sepia'],
};

const FOLDER_FIELDS: Record<string, FieldSpec> = {
  title: 'string',
  description: 'string',
  cover: 'string',
  order: 'number',
};

/** Reads a JSON file that must contain an object. Reports problems to `issues`. */
function readJsonObject(path: string, displayPath: string, issues: Issue[]): Record<string, unknown> | undefined {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    issues.push({ level: 'error', file: displayPath, message: `Invalid JSON: ${message}` });
    return undefined;
  }
  if (!isPlainObject(data)) {
    issues.push({ level: 'error', file: displayPath, message: 'Must contain a JSON object.' });
    return undefined;
  }
  return data;
}

/** Validates a "defaults" object. Non-object values are reported and ignored. */
function readDefaults(value: unknown, displayPath: string, issues: Issue[]): FolderDefaults {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) {
    issues.push({ level: 'error', file: displayPath, message: 'Field "defaults" must be an object.' });
    return {};
  }
  return readFields(value, DEFAULTS_FIELDS, displayPath, issues, 'error') as FolderDefaults;
}

/**
 * Loads `folium.config.json`. A missing file is fine (built-in defaults are used);
 * an invalid one is reported and ignored.
 */
export function loadGlobalConfig(path: string, displayPath: string, issues: Issue[]): FoliumConfig {
  if (!existsSync(path)) return structuredClone(DEFAULT_CONFIG);

  const raw = readJsonObject(path, displayPath, issues);
  if (!raw) return structuredClone(DEFAULT_CONFIG);

  const { defaults: rawDefaults, ...rest } = raw;
  const fields = readFields(rest, GLOBAL_FIELDS, displayPath, issues, 'error');
  const defaults: BookDefaults = { ...DEFAULT_CONFIG.defaults, ...readDefaults(rawDefaults, displayPath, issues) };

  return {
    title: (fields.title as string | undefined) ?? DEFAULT_CONFIG.title,
    tagline: fields.tagline as string | undefined,
    defaultTheme: (fields.defaultTheme as FoliumConfig['defaultTheme'] | undefined) ?? DEFAULT_CONFIG.defaultTheme,
    defaults,
  };
}

/** Loads the `_folder.json` of a folder, or an empty config when there is none. */
export function loadFolderConfig(path: string, displayPath: string, issues: Issue[]): FolderConfig {
  if (!existsSync(path)) return { defaults: {} };

  const raw = readJsonObject(path, displayPath, issues);
  if (!raw) return { defaults: {} };

  const { defaults: rawDefaults, ...rest } = raw;
  const fields = readFields(rest, FOLDER_FIELDS, displayPath, issues, 'error');
  return {
    title: fields.title as string | undefined,
    description: fields.description as string | undefined,
    cover: fields.cover as string | undefined,
    order: fields.order as number | undefined,
    defaults: readDefaults(rawDefaults, displayPath, issues),
  };
}
