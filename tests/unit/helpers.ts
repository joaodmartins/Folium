import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll } from 'vitest';
import { scanLibrary, type ScanResult } from '../../tools/vite-plugin-folium/scan';

export const FIXTURES = resolve(__dirname, '../fixtures');
export const FIXTURE_LIBRARY = join(FIXTURES, 'library');
export const FIXTURE_CONFIG = join(FIXTURES, 'folium.config.json');

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Creates a temporary project folder containing the given files (path → content). */
export function makeProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'folium-test-'));
  tempDirs.push(root);
  for (const [path, content] of Object.entries(files)) {
    const abs = join(root, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

/** Copies the static fixture library (+ config) into a temporary project. */
export function copyFixtureProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'folium-test-'));
  tempDirs.push(root);
  cpSync(FIXTURE_LIBRARY, join(root, 'Library'), { recursive: true });
  cpSync(FIXTURE_CONFIG, join(root, 'folium.config.json'));
  return root;
}

export function scanProject(root: string): ScanResult {
  return scanLibrary({ libraryDir: join(root, 'Library'), configFile: join(root, 'folium.config.json'), root });
}

export function scanFixture(): ScanResult {
  return scanLibrary({ libraryDir: FIXTURE_LIBRARY, configFile: FIXTURE_CONFIG, root: FIXTURES });
}

export const errorsOf = (result: ScanResult) => result.issues.filter((i) => i.level === 'error');
