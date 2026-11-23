import { describe, expect, it } from 'vitest';
import { slugPath } from '../../tools/vite-plugin-folium/slug';
import type { CategoryNode } from '../../tools/vite-plugin-folium/types';
import { errorsOf, makeProject, scanFixture, scanProject } from './helpers';

const fixture = scanFixture();
const { manifest } = fixture;
const book = (id: string) => {
  const found = manifest.books.find((b) => b.id === id);
  if (!found) throw new Error(`Book not found: ${id}`);
  return found;
};

describe('discovery', () => {
  it('finds books recursively and reports no problems for the fixture library', () => {
    expect(fixture.issues).toEqual([]);
    expect(manifest.books.map((b) => b.path).sort()).toEqual(
      [
        'Languages/German/A1/Hallo.md',
        'Languages/Russian/A1/Alphabet.md',
        'Languages/Russian/A1/Lesson 1.md',
        'Languages/Russian/A1/Lesson 10.md',
        'Languages/Russian/A1/Lesson 2.md',
        'Sample/Category/Sample Book.md',
        'Top Level.md',
        'University/Operating Systems/Practice/lab-notes.md',
        'University/Operating Systems/Theory/Lesson 1.md',
      ].sort(),
    );
  });

  it('preserves the folder structure in path, category and ids', () => {
    expect(book('languages/russian/a1/alphabet')).toMatchObject({
      path: 'Languages/Russian/A1/Alphabet.md',
      category: 'Languages/Russian/A1',
      categoryId: 'languages/russian/a1',
    });
    expect(book('university/operating-systems/theory/lesson-1').category).toBe('University/Operating Systems/Theory');
    expect(book('top-level')).toMatchObject({ category: '', categoryId: '' });
  });

  it('ignores hidden files/folders and non-Markdown files', () => {
    const paths = manifest.books.map((b) => b.path);
    expect(paths.some((p) => p.includes('.hidden') || p.includes('.secret') || p.endsWith('.txt'))).toBe(false);
  });

  it('accepts new files without any code change', () => {
    const root = makeProject({ 'Library/Brand New/Deep/Folder/Book.md': '# Hello\n' });
    const result = scanProject(root);
    expect(errorsOf(result)).toEqual([]);
    expect(result.manifest.books.map((b) => b.id)).toEqual(['brand-new/deep/folder/book']);
  });

  it('reports a missing library folder', () => {
    const root = makeProject({});
    const result = scanProject(root);
    expect(errorsOf(result)).toHaveLength(1);
    expect(result.issues[0].message).toContain('Library folder not found');
    expect(result.manifest.books).toEqual([]);
  });

  it('handles an empty library', () => {
    const root = makeProject({ 'Library/.gitkeep': '' });
    const result = scanProject(root);
    expect(result.issues).toEqual([]);
    expect(result.manifest.books).toEqual([]);
    expect(result.manifest.root.categories).toEqual([]);
  });
});

describe('titles', () => {
  it('uses the frontmatter title first', () => {
    expect(book('languages/russian/a1/alphabet').title).toBe('Russian Alphabet');
  });

  it('falls back to the first H1 (books without frontmatter are accepted)', () => {
    expect(book('languages/russian/a1/lesson-1').title).toBe('Lesson 1');
    // The only "# " inside a code fence must not be used as the title.
    expect(book('university/operating-systems/theory/lesson-1').title).toBe('Operating Systems - Lesson 1');
  });

  it('falls back to the file name when there is no title and no H1', () => {
    expect(book('university/operating-systems/practice/lab-notes').title).toBe('lab-notes');
  });
});

describe('drafts', () => {
  it('excludes draft books from the manifest', () => {
    expect(manifest.books.some((b) => b.path.endsWith('Secret.md') || b.path.includes('Drafts Only'))).toBe(false);
  });

  it('prunes categories that only contain drafts', () => {
    const languages = manifest.root.categories.find((c) => c.name === 'Languages')!;
    expect(languages.categories.map((c) => c.name)).not.toContain('Drafts Only');
  });
});

describe('configuration inheritance and precedence', () => {
  it('applies the global config to books outside any folder config', () => {
    expect(book('top-level').meta).toMatchObject({
      author: 'Global Author',
      language: 'en',
      showTableOfContents: false,
      chapterBreak: 'h2',
    });
  });

  it('lets folder defaults override the global config', () => {
    expect(book('languages/german/a1/hallo').meta).toMatchObject({
      author: 'Folder Author', // Languages/_folder.json
      language: 'pt', // Languages/_folder.json
      chapterBreak: 'h2', // still global
    });
  });

  it('inherits defaults from parent folders and lets deeper folders override them', () => {
    expect(book('languages/russian/a1/lesson-1').meta).toMatchObject({
      author: 'Folder Author', // from Languages (grandparent)
      language: 'ru', // Russian overrides Languages
      showTableOfContents: true, // from Russian
    });
  });

  it('lets the frontmatter override everything', () => {
    expect(book('languages/russian/a1/alphabet').meta).toMatchObject({
      author: 'Frontmatter Author',
      language: 'ru',
      chapterBreak: 'none',
      description: 'The Cyrillic alphabet.',
      order: 2,
    });
  });

  it('resolves covers relative to the file that declares them', () => {
    expect(book('languages/russian/a1/alphabet').meta.cover).toBe('Languages/Russian/A1/cover.jpg');
    const russian = manifest.root.categories
      .find((c) => c.name === 'Languages')!
      .categories.find((c) => c.name === 'Russian')!;
    expect(russian.cover).toBe('Languages/Russian/russian.png');
  });

  it('rejects covers that escape the Library folder', () => {
    const root = makeProject({ 'Library/a.md': '---\ncover: ../../secret.png\n---\n# A\n' });
    const result = scanProject(root);
    expect(errorsOf(result)).toHaveLength(1);
    expect(errorsOf(result)[0].message).toContain('must stay inside the Library folder');
    expect(result.manifest.books).toEqual([]);
  });
});

describe('invalid content', () => {
  it('reports invalid frontmatter with the file path and leaves only that book out', () => {
    const root = makeProject({
      'Library/Good.md': '# Good\n',
      'Library/Bad.md': '---\norder: first\n---\n# Bad\n',
      'Library/Broken.md': '---\ntitle: [oops\n---\n# Broken\n',
    });
    const result = scanProject(root);
    expect(result.manifest.books.map((b) => b.title)).toEqual(['Good']);
    const errors = errorsOf(result);
    expect(errors.map((e) => e.file).sort()).toEqual(['Library/Bad.md', 'Library/Broken.md']);
  });

  it('reports invalid _folder.json and invalid folium.config.json', () => {
    const root = makeProject({
      'folium.config.json': '{ nope',
      'Library/Sub/_folder.json': '{ "order": "x" }',
      'Library/Sub/Book.md': '# Book\n',
    });
    const result = scanProject(root);
    expect(errorsOf(result).map((e) => e.file).sort()).toEqual(['Library/Sub/_folder.json', 'folium.config.json']);
    expect(result.manifest.books).toHaveLength(1);
  });

  it('reports two books that would get the same id', () => {
    const root = makeProject({ 'Library/Lesson 1.md': '# A\n', 'Library/lesson-1.md': '# B\n' });
    const result = scanProject(root);
    expect(result.manifest.books).toHaveLength(1);
    expect(errorsOf(result)[0].message).toContain('already used');
  });
});

describe('ordering', () => {
  const root = manifest.root;
  const names = (nodes: CategoryNode[]) => nodes.map((n) => n.name);

  it('orders categories by "order", then naturally by name', () => {
    // Sample (order 1), Languages (order 2), University (no order)
    expect(names(root.categories)).toEqual(['Sample', 'Languages', 'University']);
    const languages = root.categories.find((c) => c.name === 'Languages')!;
    // Russian (order 1) before German (no order)
    expect(names(languages.categories)).toEqual(['Russian', 'German']);
    const os = root.categories.find((c) => c.name === 'University')!.categories[0];
    // no order: alphabetical
    expect(names(os.categories)).toEqual(['Practice', 'Theory']);
  });

  it('orders books by "order" first, then naturally by file name (2 before 10)', () => {
    const a1 = root.categories[1].categories[0].categories[0];
    expect(a1.path).toBe('Languages/Russian/A1');
    // Alphabet has order 2 → first; the rest in natural order.
    expect(a1.bookIds).toEqual([
      'languages/russian/a1/alphabet',
      'languages/russian/a1/lesson-1',
      'languages/russian/a1/lesson-2',
      'languages/russian/a1/lesson-10',
    ]);
  });

  it('is deterministic and keeps the flat list in tree order', () => {
    expect(scanFixture().manifest).toEqual(manifest);
    expect(manifest.books.map((b) => b.id)).toEqual([
      'sample/category/sample-book',
      'languages/russian/a1/alphabet',
      'languages/russian/a1/lesson-1',
      'languages/russian/a1/lesson-2',
      'languages/russian/a1/lesson-10',
      'languages/german/a1/hallo',
      'university/operating-systems/practice/lab-notes',
      'university/operating-systems/theory/lesson-1',
      'top-level',
    ]);
  });
});

describe('category tree', () => {
  it('builds the root from the site title', () => {
    expect(manifest.root).toMatchObject({ id: '', name: '', path: '', title: 'Fixture Library' });
    expect(manifest.root.bookIds).toEqual(['top-level']);
  });

  it('supports several levels and keeps folder metadata', () => {
    const languages = manifest.root.categories.find((c) => c.name === 'Languages')!;
    expect(languages).toMatchObject({ id: 'languages', title: 'Languages', description: 'Language courses.', order: 2 });

    const russian = languages.categories[0];
    const a1 = russian.categories[0];
    expect(a1).toMatchObject({ id: 'languages/russian/a1', path: 'Languages/Russian/A1', title: 'A1' });
    expect(a1.categories).toEqual([]);
    expect(a1.bookIds).toHaveLength(4);
  });

  it('uses the folder name as title when there is no _folder.json title', () => {
    const os = manifest.root.categories.find((c) => c.name === 'University')!.categories[0];
    expect(os.title).toBe('Operating Systems');
    expect(os.id).toBe('university/operating-systems');
  });

  it('references every book in exactly one category', () => {
    const ids: string[] = [];
    const walk = (n: CategoryNode) => {
      ids.push(...n.bookIds);
      n.categories.forEach(walk);
    };
    walk(manifest.root);
    expect([...ids].sort()).toEqual(manifest.books.map((b) => b.id).sort());
  });
});

describe('slugPath', () => {
  it('slugs each segment, handling spaces, accents and non-latin scripts', () => {
    expect(slugPath('University/Operating Systems/Lição 1')).toBe('university/operating-systems/licao-1');
    expect(slugPath('Languages/Русский')).toBe('languages/русский');
    expect(slugPath('')).toBe('');
  });
});
