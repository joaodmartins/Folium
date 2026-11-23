// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PAGE_START_CLASS } from '../../src/reader/pages';
import type { ChapterBreak } from '../../tools/vite-plugin-folium/types';
import { render } from './reader-helpers';

/** Text of every element that starts a page. */
function pageStarts(markdown: string, chapterBreak: ChapterBreak = 'none', title = 'Some other title') {
  const { element } = render(markdown, { chapterBreak, title });
  return [...element.querySelectorAll(`.${PAGE_START_CLASS}`)].map((e) => e.textContent?.trim());
}

describe('manual page breaks', () => {
  it('make the next element start a page, and leave no trace of the instruction', () => {
    const { element } = render('Before\n\n<!-- pagebreak -->\n\nAfter');
    expect(element.querySelector('.pagebreak')).toBeNull();
    expect(element.textContent).not.toMatch(/pagebreak/i);
    expect([...element.querySelectorAll('p')].map((p) => [p.textContent, p.classList.contains(PAGE_START_CLASS)])).toEqual([
      ['Before', false],
      ['After', true],
    ]);
  });

  it('accepts spacing and case variations', () => {
    for (const marker of ['<!--pagebreak-->', '<!--   pagebreak   -->', '<!-- PageBreak -->', '  <!-- pagebreak -->']) {
      expect(pageStarts(`A\n\n${marker}\n\nB`), marker).toEqual(['B']);
    }
  });

  it('works in several places of the document', () => {
    expect(pageStarts('A\n\n<!-- pagebreak -->\n\nB\n\n<!-- pagebreak -->\n\nC\n\n<!-- pagebreak -->\n\nD')).toEqual(['B', 'C', 'D']);
  });

  it('makes headings, lists, tables and code start pages too', () => {
    const md = '<!-- pagebreak -->\n\nx\n\n<!-- pagebreak -->\n\n## H\n\n<!-- pagebreak -->\n\n- a\n\n<!-- pagebreak -->\n\n```\ncode\n```';
    const { element } = render(md);
    expect([...element.querySelectorAll(`.${PAGE_START_CLASS}`)].map((e) => e.tagName)).toEqual(['H2', 'UL', 'PRE']);
  });

  it('creates no empty pages: leading, trailing and repeated markers are ignored', () => {
    expect(pageStarts('<!-- pagebreak -->\n\nA')).toEqual([]); // the book already starts a page
    expect(pageStarts('A\n\n<!-- pagebreak -->')).toEqual([]); // nothing follows
    expect(pageStarts('A\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->\n\nB')).toEqual(['B']);
    expect(pageStarts('<!-- pagebreak -->\n\n<!-- pagebreak -->\n\nA\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->')).toEqual([]);
  });

  it('ignores a marker before the first visible element when the first heading is the hidden title', () => {
    // the title is hidden, so "Text" is already the first thing on the first page
    expect(pageStarts('# Same title\n\n<!-- pagebreak -->\n\nText', 'none', 'Same title')).toEqual([]);
  });

  it('a marker at the end of a quote or list starts the next block after it', () => {
    const { element } = render('> quoted\n>\n> <!-- pagebreak -->\n\nafter');
    expect(element.querySelector('blockquote')?.classList.contains(PAGE_START_CLASS)).toBe(false);
    expect(element.querySelector(':scope > p')?.classList.contains(PAGE_START_CLASS)).toBe(true);
  });

  it('does not treat comments in code or other comments as page breaks', () => {
    expect(pageStarts('A\n\n```html\n<!-- pagebreak -->\n```\n\nB')).toEqual([]);
    expect(pageStarts('A\n\n<!-- just a comment -->\n\nB')).toEqual([]);
  });
});

describe('chapter breaks', () => {
  const book = '# Part\n\nintro\n\n## Chapter 1\n\ntext\n\n### Section\n\ntext\n\n## Chapter 2\n\ntext\n\n# Part 2\n\n## Chapter 3\n\ntext';

  it('"h1": level-1 headings start pages (not the first one)', () => {
    expect(pageStarts(book, 'h1')).toEqual(['Part 2']);
  });

  it('"h2": level-1 and level-2 headings start pages', () => {
    // "Chapter 3" follows "Part 2" directly, so it stays with it.
    expect(pageStarts(book, 'h2')).toEqual(['Chapter 1', 'Chapter 2', 'Part 2']);
  });

  it('"none": no headings start pages', () => {
    expect(pageStarts(book, 'none')).toEqual([]);
  });

  it('is "none" when the book does not say', () => {
    expect(render(book).element.querySelector(`.${PAGE_START_CLASS}`)).toBeNull();
  });

  it('never breaks before the first heading of the book, even when the title is hidden', () => {
    expect(pageStarts('# Title\n\ntext\n\n# Second', 'h1', 'Title')).toEqual(['Second']);
    expect(pageStarts('## First\n\ntext\n\n## Second', 'h2', 'Unrelated')).toEqual(['Second']);
  });

  it('keeps a heading together with the heading before it (no page with only a title)', () => {
    expect(pageStarts('text\n\n# Part\n\n## Chapter\n\ntext', 'h2')).toEqual(['Part']);
    expect(pageStarts('text\n\n# Part\n\n## Chapter\n\n### Section\n\ntext', 'h2')).toEqual(['Part']);
  });

  it('does not add a second break where a manual one is already', () => {
    const { element } = render('text\n\n<!-- pagebreak -->\n\n# Chapter\n\ntext', { chapterBreak: 'h1' });
    expect(element.querySelectorAll(`.${PAGE_START_CLASS}`)).toHaveLength(1);
    expect(element.querySelector('h1')?.classList.contains(PAGE_START_CLASS)).toBe(true);
  });

  it('a heading right after a heading that starts a page (manual break) is not broken again', () => {
    expect(pageStarts('text\n\n<!-- pagebreak -->\n\n# Part\n\n## Chapter\n\ntext', 'h2')).toEqual(['Part']);
  });

  it('only top-level headings count (not headings inside quotes or lists)', () => {
    expect(pageStarts('text\n\n> # Quoted heading\n\n- # Listed heading', 'h1')).toEqual([]);
  });

  it('is consistent: rendering twice gives the same result', () => {
    expect(pageStarts(book, 'h2')).toEqual(pageStarts(book, 'h2'));
  });
});
