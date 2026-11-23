import { describe, expect, it, vi } from 'vitest';
import type { Book } from '../../tools/vite-plugin-folium/types';
import { createSourceLoader, loadFromManifest } from '../../src/reader/source';

const book = (id: string): Book => ({
  id,
  title: id,
  path: `${id}.md`,
  category: '',
  categoryId: '',
  meta: { language: 'en', showTableOfContents: false, chapterBreak: 'h1' },
});

describe('createSourceLoader', () => {
  it('loads a book once, even when requested several times at once', async () => {
    const load = vi.fn(async (b: Book) => `source of ${b.id}`);
    const loader = createSourceLoader(load);
    const [a, b] = await Promise.all([loader(book('x')), loader(book('x'))]);
    expect(a).toBe('source of x');
    expect(b).toBe('source of x');
    await loader(book('x'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads different books separately and only on demand', async () => {
    const load = vi.fn(async (b: Book) => b.id);
    const loader = createSourceLoader(load);
    expect(load).not.toHaveBeenCalled();
    await loader(book('a'));
    await loader(book('b'));
    expect(load.mock.calls.map(([b]) => b.id)).toEqual(['a', 'b']);
  });

  it('does not cache failures, so the next attempt retries', async () => {
    const load = vi.fn<(b: Book) => Promise<string>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('ok');
    const loader = createSourceLoader(load);
    await expect(loader(book('x'))).rejects.toThrow('offline');
    await expect(loader(book('x'))).resolves.toBe('ok');
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('loadFromManifest', () => {
  it('calls the loader the manifest attached to the book', async () => {
    await expect(loadFromManifest({ ...book('x'), load: async () => '# md' } as Book)).resolves.toBe('# md');
  });

  it('rejects with a clear message when the book has no loader', async () => {
    await expect(loadFromManifest(book('x'))).rejects.toThrow('Book "x" has no content loader.');
  });
});
