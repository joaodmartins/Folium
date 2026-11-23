import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import folium from '../../tools/vite-plugin-folium';
import type { LibraryManifest, LoadableBook } from '../../tools/vite-plugin-folium/types';
import { copyFixtureProject, makeProject } from './helpers';

const servers: ViteDevServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function startServer(root: string): Promise<ViteDevServer> {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, ws: false },
    optimizeDeps: { noDiscovery: true },
    plugins: [folium()],
  });
  servers.push(server);
  return server;
}

async function loadManifest(server: ViteDevServer): Promise<LibraryManifest<LoadableBook>> {
  const mod = await server.ssrLoadModule('virtual:folium-library');
  return mod.manifest as LibraryManifest<LoadableBook>;
}

describe('virtual:folium-library', () => {
  it('exposes the manifest discovered in Library/', async () => {
    const server = await startServer(copyFixtureProject());
    const manifest = await loadManifest(server);

    expect(manifest.config.title).toBe('Fixture Library');
    expect(manifest.books).toHaveLength(9);
    expect(manifest.root.categories.map((c) => c.name)).toEqual(['Sample', 'Languages', 'University']);
    expect(manifest.books[0]).toMatchObject({ id: 'sample/category/sample-book', title: 'Sample Book' });
  });

  it('gives each book a lazy loader for its raw Markdown (frontmatter included)', async () => {
    const server = await startServer(copyFixtureProject());
    const manifest = await loadManifest(server);

    const alphabet = manifest.books.find((b) => b.id === 'languages/russian/a1/alphabet')!;
    expect(typeof alphabet.load).toBe('function');
    const source = await alphabet.load();
    expect(source).toContain('title: Russian Alphabet');
    expect(source).toContain('# Heading that is NOT the title');

    // Files with spaces in their names load too.
    const lesson = manifest.books.find((b) => b.path === 'University/Operating Systems/Theory/Lesson 1.md')!;
    expect(await lesson.load()).toContain('# Operating Systems - Lesson 1');
  });

  it('picks up added, changed and removed books without code changes', async () => {
    const root = copyFixtureProject();
    const server = await startServer(root);
    expect((await loadManifest(server)).books).toHaveLength(9);

    // Add a new book inside a brand-new nested category.
    const newDir = join(root, 'Library', 'Cooking', 'Italian');
    mkdirSync(newDir, { recursive: true });
    writeFileSync(join(newDir, 'Pasta.md'), '---\ntitle: Pasta\n---\n# Ignored heading\n');
    server.watcher.emit('add', join(newDir, 'Pasta.md'));
    await new Promise((r) => setTimeout(r, 150)); // plugin debounce

    let manifest = await loadManifest(server);
    expect(manifest.books).toHaveLength(10);
    expect(manifest.books.find((b) => b.id === 'cooking/italian/pasta')).toMatchObject({
      title: 'Pasta',
      category: 'Cooking/Italian',
    });
    expect(manifest.root.categories.map((c) => c.name)).toContain('Cooking');

    // Change its frontmatter.
    writeFileSync(join(newDir, 'Pasta.md'), '---\ntitle: Fresh Pasta\n---\n');
    server.watcher.emit('change', join(newDir, 'Pasta.md'));
    await new Promise((r) => setTimeout(r, 150));
    manifest = await loadManifest(server);
    expect(manifest.books.find((b) => b.id === 'cooking/italian/pasta')!.title).toBe('Fresh Pasta');

    // Remove it again: the now-empty categories disappear too.
    rmSync(join(root, 'Library', 'Cooking'), { recursive: true });
    server.watcher.emit('unlink', join(newDir, 'Pasta.md'));
    await new Promise((r) => setTimeout(r, 150));
    manifest = await loadManifest(server);
    expect(manifest.books).toHaveLength(9);
    expect(manifest.root.categories.map((c) => c.name)).not.toContain('Cooking');
  });

  it('fails with a clear message when the library has errors', async () => {
    const root = makeProject({
      'Library/Broken.md': '---\norder: first\n---\n# Broken\n',
    });
    const server = await startServer(root);
    await expect(server.ssrLoadModule('virtual:folium-library')).rejects.toThrow(
      /Library\/Broken\.md: Field "order" must be a number/,
    );
  });
});
