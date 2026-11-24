// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { html, render } from './reader-helpers';

describe('Markdown rendering', () => {
  it('renders headings H1 to H6 with their level', () => {
    const { element } = render('# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six');
    expect([...element.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => `${h.tagName}:${h.textContent}`)).toEqual([
      'H1:One',
      'H2:Two',
      'H3:Three',
      'H4:Four',
      'H5:Five',
      'H6:Six',
    ]);
  });

  it('renders paragraphs and keeps a single newline inside the paragraph', () => {
    const { element } = render('First paragraph\ncontinues here.\n\nSecond paragraph.');
    const paragraphs = element.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe('First paragraph\ncontinues here.');
    expect(paragraphs[0].querySelector('br')).toBeNull();
  });

  it('supports explicit line breaks (two trailing spaces or a backslash)', () => {
    expect(render('one  \ntwo').element.querySelectorAll('br')).toHaveLength(1);
    expect(render('one\\\ntwo').element.querySelectorAll('br')).toHaveLength(1);
  });

  it('renders bold, italic, strikethrough and inline code', () => {
    const { element } = render('**bold** and *italic* and ~~gone~~ and `code()`');
    expect(element.querySelector('strong')?.textContent).toBe('bold');
    expect(element.querySelector('em')?.textContent).toBe('italic');
    expect(element.querySelector('s')?.textContent).toBe('gone');
    expect(element.querySelector('p > code')?.textContent).toBe('code()');
  });

  it('renders unordered, ordered (with start) and nested lists', () => {
    const { element } = render('- a\n- b\n  - b1\n\n3. three\n4. four');
    const lists = [...element.querySelectorAll(':scope > ul, :scope > ol')];
    expect(lists.map((l) => l.tagName)).toEqual(['UL', 'OL']);
    expect(lists[0].querySelectorAll(':scope > li')).toHaveLength(2);
    expect(lists[0].querySelector('li ul li')?.textContent).toBe('b1');
    expect(lists[1].getAttribute('start')).toBe('3');
  });

  it('renders blockquotes and horizontal rules', () => {
    const { element } = render('> quoted *text*\n\n---\n\nafter');
    expect(element.querySelector('blockquote p')?.textContent).toBe('quoted text');
    expect(element.querySelector('blockquote em')).not.toBeNull();
    expect(element.querySelectorAll('hr')).toHaveLength(1);
  });

  it('renders tables, wrapped in a container that can scroll', () => {
    const { element } = render('| Letter | Sound |\n|--------|:-----:|\n| А | a |\n| Б | b |');
    const wrapper = element.querySelector('.table-wrap');
    expect(wrapper?.querySelector('table')).not.toBeNull();
    expect(wrapper?.hasAttribute('tabindex')).toBe(false); // focusable only when it scrolls: the reader decides once the pages are laid out
    expect([...element.querySelectorAll('th')].map((c) => c.textContent)).toEqual(['Letter', 'Sound']);
    expect(element.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(element.querySelectorAll('tbody td')[2].textContent).toBe('Б');
  });

  it('a <pre> written as raw HTML gets a <code> inside, so that it scrolls like any other block of code', () => {
    const { element } = render('<pre>first line\n  second <b>line</b></pre>');
    const code = element.querySelector('pre > code');
    expect(code?.textContent).toBe('first line\n  second line'); // the markup inside is not kept (the sanitizer allows no <b> in code), the text is
    expect(element.querySelectorAll('pre > code')).toHaveLength(1);
    expect(element.querySelector('pre > code > .code-copy, pre > .code-copy')).not.toBeNull(); // and it has the Copy button
  });

  it('renders fenced code blocks with their language, preserving whitespace and special characters', () => {
    const { element } = render('```c\nif (a < b && c > d) {\n    return 1;\n}\n```');
    const code = element.querySelector('pre > code');
    expect(code?.className).toBe('language-c');
    expect(code?.textContent).toBe('if (a < b && c > d) {\n    return 1;\n}\n');
    // Whether a block scrolls depends on the page size: the reader makes it focusable once the pages are laid out.
    expect(element.querySelector('pre')?.hasAttribute('tabindex')).toBe(false);
    expect(code?.hasAttribute('tabindex')).toBe(false);
  });

  it('renders indented code blocks and code fences without a language', () => {
    expect(render('    indented').element.querySelector('pre > code')?.textContent).toBe('indented\n');
    expect(render('```\nplain\n```').element.querySelector('pre > code')?.className).toBe('');
  });

  it('shows Cyrillic and other Unicode text untouched', () => {
    expect(render('А Б В Г Д — алфавит').element.textContent).toBe('А Б В Г Д — алфавит\n');
  });

  it('ignores the YAML frontmatter', () => {
    const { element } = render('---\ntitle: Hidden\nauthor: Me\n---\n\n# Visible\n');
    expect(element.textContent).not.toContain('Hidden');
    expect(element.querySelector('h1')?.textContent).toBe('Visible');
  });

  it('keeps harmless inline HTML', () => {
    const { element } = render('Press <kbd>Ctrl</kbd> + <kbd>C</kbd>.\n\n<details><summary>More</summary>text</details>');
    expect(element.querySelectorAll('kbd')).toHaveLength(2);
    expect(element.querySelector('details summary')?.textContent).toBe('More');
  });

  it('renders an empty book without errors', () => {
    expect(html('')).toBe('');
    expect(html('---\ntitle: Only frontmatter\n---\n')).toBe('');
  });
});

describe('page tidy-ups', () => {
  it('hides a leading H1 that repeats the book title (the page header already shows it)', () => {
    const { element, headings } = render('# Russian Alphabet\n\nIntro', { title: 'Russian Alphabet' });
    expect(element.querySelector('h1')?.hasAttribute('hidden')).toBe(true);
    expect(headings[0]).toMatchObject({ level: 1, text: 'Russian Alphabet' }); // still listed for the future TOC
  });

  it('keeps an H1 that differs from the title, or that is not first', () => {
    expect(render('# Something else\n', { title: 'Russian Alphabet' }).element.querySelector('h1[hidden]')).toBeNull();
    expect(render('Intro\n\n# Russian Alphabet\n', { title: 'Russian Alphabet' }).element.querySelector('h1[hidden]')).toBeNull();
  });
});
