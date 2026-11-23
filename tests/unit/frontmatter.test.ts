import { describe, expect, it } from 'vitest';
import { extractFirstH1, parseFrontmatter, splitFrontmatter } from '../../tools/vite-plugin-folium/frontmatter';
import type { Issue } from '../../tools/vite-plugin-folium/types';

describe('splitFrontmatter', () => {
  it('separates the YAML block from the body', () => {
    const { yaml, body } = splitFrontmatter('---\ntitle: A\n---\n\n# Body\n');
    expect(yaml).toBe('title: A');
    expect(body).toBe('\n# Body\n');
  });

  it('returns null yaml when there is no frontmatter', () => {
    const { yaml, body } = splitFrontmatter('# Just markdown\n');
    expect(yaml).toBeNull();
    expect(body).toBe('# Just markdown\n');
  });

  it('handles CRLF line endings and a BOM', () => {
    const { yaml, body } = splitFrontmatter('﻿---\r\ntitle: A\r\n---\r\n# Body');
    expect(yaml).toBe('title: A');
    expect(body).toBe('# Body');
  });

  it('accepts an empty frontmatter block', () => {
    expect(splitFrontmatter('---\n---\n# Body').yaml).toBe('');
  });

  it('treats an unclosed block (e.g. a leading horizontal rule) as plain content', () => {
    const text = '---\nnot closed\n\n# Body';
    expect(splitFrontmatter(text)).toEqual({ yaml: null, body: text });
  });
});

describe('parseFrontmatter', () => {
  const parse = (yaml: string | null) => {
    const issues: Issue[] = [];
    const data = parseFrontmatter(yaml, 'book.md', issues);
    return { data, issues };
  };

  it('reads every supported field', () => {
    const { data, issues } = parse(
      [
        'title: My Book',
        'author: Me',
        'description: About things',
        'cover: cover.jpg',
        'language: pt',
        'showTableOfContents: true',
        'order: 3',
        'chapterBreak: h2',
        'draft: false',
      ].join('\n'),
    );
    expect(issues).toEqual([]);
    expect(data).toEqual({
      title: 'My Book',
      author: 'Me',
      description: 'About things',
      cover: 'cover.jpg',
      language: 'pt',
      showTableOfContents: true,
      order: 3,
      chapterBreak: 'h2',
      draft: false,
    });
  });

  it('returns an empty object for missing or empty frontmatter', () => {
    expect(parse(null)).toEqual({ data: {}, issues: [] });
    expect(parse('')).toEqual({ data: {}, issues: [] });
    expect(parse('# only a comment')).toEqual({ data: {}, issues: [] });
  });

  it('reports invalid YAML as an error', () => {
    const { data, issues } = parse('title: [unclosed');
    expect(data).toEqual({});
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'error', file: 'book.md' });
    expect(issues[0].message).toContain('Invalid YAML');
  });

  it('reports a non-mapping frontmatter as an error', () => {
    const { issues } = parse('- a\n- b');
    expect(issues[0]).toMatchObject({ level: 'error' });
    expect(issues[0].message).toContain('mapping');
  });

  it('reports wrong value types and drops those fields', () => {
    const { data, issues } = parse('title: 42\norder: first\nchapterBreak: h5\nshowTableOfContents: "yes"\nauthor: Ok');
    expect(data).toEqual({ author: 'Ok' });
    expect(issues.map((i) => i.level)).toEqual(['error', 'error', 'error', 'error']);
    expect(issues.map((i) => i.message).join('\n')).toMatch(/"title".*"order".*"chapterBreak".*"showTableOfContents"/s);
  });

  it('only warns about unknown fields (other tools add their own)', () => {
    const { data, issues } = parse('title: A\ntags: [x]');
    expect(data).toEqual({ title: 'A' });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'warning' });
    expect(issues[0].message).toContain('"tags"');
  });
});

describe('extractFirstH1', () => {
  it('returns the first level-1 heading', () => {
    expect(extractFirstH1('Intro\n\n# First\n\n# Second')).toBe('First');
  });

  it('ignores deeper headings, closing hashes and fenced code', () => {
    expect(extractFirstH1('## Not this\n```\n# in code\n```\n# Real ##')).toBe('Real');
  });

  it('returns undefined when there is no H1', () => {
    expect(extractFirstH1('Just text\n## Sub')).toBeUndefined();
  });
});
