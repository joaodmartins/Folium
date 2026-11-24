// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildToc, toTree } from '../../src/reader/toc';
import { render } from './reader-helpers';

const tocOf = (markdown: string) => {
  const { element } = render(markdown);
  return buildToc(element);
};
const shape = (markdown: string) => tocOf(markdown).map((e) => `${'  '.repeat(e.depth)}${e.text}`);

describe('table of contents: structure', () => {
  const book = '# Book\n\n## One\n\n### One A\n\n### One B\n\n## Two\n\n#### too deep\n\n### Two A\n\n# Second part\n\n## Three';

  it('lists H1, H2 and H3 in the order of the book, with their depth', () => {
    expect(shape(book)).toEqual(['Book', '  One', '    One A', '    One B', '  Two', '    Two A', 'Second part', '  Three']);
    expect(tocOf(book).map((e) => e.level)).toEqual([1, 2, 3, 3, 2, 3, 1, 2]);
  });

  it('leaves out headings deeper than H3 (their section belongs to their parent)', () => {
    const entries = tocOf('## A\n\n#### deep\n\n##### deeper\n\n###### deepest');
    expect(entries.map((e) => e.text)).toEqual(['A']);
  });

  it('uses the ids that the renderer gave to the headings, which exist in the book', () => {
    const { element } = render(book);
    for (const entry of buildToc(element)) {
      expect(element.querySelector(`[id="${entry.id}"]`)?.textContent?.trim(), entry.id).toBeTruthy();
    }
    expect(buildToc(element).map((e) => e.id)).toEqual(['book', 'one', 'one-a', 'one-b', 'two', 'two-a', 'second-part', 'three']);
  });

  it('a heading that skips a level is one level in, and a new top level starts again at 0', () => {
    expect(shape('# A\n\n### C under A\n\n## B\n\n# D\n\n### E under D')).toEqual(['A', '  C under A', '  B', 'D', '  E under D']);
    expect(shape('### Starts deep\n\n## Then higher\n\n# Then top')).toEqual(['Starts deep', 'Then higher', 'Then top']);
    expect(tocOf('### Starts deep\n\n## Then higher')[1].depth).toBe(0); // H2 closes the H3: both top level
  });

  it('the tree has the same entries as the flat list, nested by depth', () => {
    const tree = toTree(tocOf(book));
    expect(tree.map((n) => n.entry.text)).toEqual(['Book', 'Second part']);
    expect(tree[0].children.map((n) => n.entry.text)).toEqual(['One', 'Two']);
    expect(tree[0].children[0].children.map((n) => n.entry.text)).toEqual(['One A', 'One B']);
    expect(tree[1].children.map((n) => n.entry.text)).toEqual(['Three']);
    const count = (nodes: typeof tree): number => nodes.reduce((sum, n) => sum + 1 + count(n.children), 0);
    expect(count(tree)).toBe(tocOf(book).length);
  });
});

describe('table of contents: repeated, empty and missing headings', () => {
  it('repeated headings are all listed, each with its own unique id', () => {
    const entries = tocOf('## Exercises\n\ntext\n\n## Exercises\n\ntext\n\n### Exercises\n\n## Exercises 1');
    expect(entries.map((e) => e.text)).toEqual(['Exercises', 'Exercises', 'Exercises', 'Exercises 1']);
    const ids = entries.map((e) => e.id);
    expect(ids).toEqual(['exercises', 'exercises-1', 'exercises-2', 'exercises-1-1']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('empty headings (nothing to show) are not listed', () => {
    const entries = tocOf('## Real\n\n##\n\n## \n\n## Also real');
    expect(entries.map((e) => e.text)).toEqual(['Real', 'Also real']);
  });

  it('a book without headings has an empty table of contents', () => {
    expect(tocOf('Just a paragraph.\n\nAnother one.')).toEqual([]);
    expect(tocOf('')).toEqual([]);
    expect(tocOf('#### only deep\n\ntext')).toEqual([]);
  });

  it('headings written as HTML are listed too, and headings in quotes or lists keep their order', () => {
    expect(shape('## Before\n\n<h3>Raw</h3>\n\n> ## Quoted\n\n## After')).toEqual(['Before', '  Raw', 'Quoted', 'After']);
  });
});

describe('table of contents: headings with maths, code and emphasis', () => {
  it('shows the rendered formula, not the TeX that was written', () => {
    const [entry] = tocOf('## The $x^2$ law');
    const holder = document.createElement('div');
    holder.append(entry.label.cloneNode(true));
    expect(holder.querySelector('.katex')).not.toBeNull();
    expect(holder.querySelector('annotation')).toBeNull(); // the TeX source is not in the panel, not even hidden
    expect(holder.textContent).not.toContain('x^2');
    expect(holder.textContent).not.toContain('$');
    expect(holder.textContent).not.toMatch(/\\[a-z]+/);
    expect(entry.text.startsWith('The ')).toBe(true);
    expect(entry.text.endsWith(' law')).toBe(true);
  });

  it('keeps the readable maths for screen readers (MathML) and no TeX for complex formulas', () => {
    const entries = tocOf('## Proof of $\\frac{a}{b} \\leq \\sqrt{\\pi}$\n\n### $\\sum_{i=1}^{n} i$');
    for (const entry of entries) {
      const holder = document.createElement('div');
      holder.append(entry.label.cloneNode(true));
      expect(holder.querySelector('math'), entry.text).not.toBeNull();
      expect(holder.textContent).not.toMatch(/\\(frac|leq|sqrt|pi|sum)/);
      expect(holder.textContent).not.toContain('$');
    }
    expect(entries[1].text).not.toBe(''); // a heading that is only a formula still has a label
  });

  it('keeps inline code and emphasis, without links or ids', () => {
    const [entry] = tocOf('## The `fork()` call and *more* [with a link](https://example.com)');
    const holder = document.createElement('div');
    holder.append(entry.label.cloneNode(true));
    expect(holder.querySelector('code')?.textContent).toBe('fork()');
    expect(holder.querySelector('em')?.textContent).toBe('more');
    expect(holder.querySelector('a')).toBeNull(); // a link inside a button would be invalid
    expect(holder.querySelector('[id]')).toBeNull();
    expect(entry.text).toBe('The fork() call and more with a link');
  });

  it('the labels are copies: building the table does not change the book', () => {
    const { element } = render('## The $x^2$ law');
    const before = element.innerHTML;
    buildToc(element);
    expect(element.innerHTML).toBe(before);
    expect(element.querySelector('h2 annotation')).not.toBeNull(); // the book's own heading keeps its MathML source
  });

  it('a heading with an invalid formula is still listed', () => {
    const entries = tocOf('## Broken $\\frac{1$ formula');
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toContain('Broken');
  });

  it('the hidden title heading (the book title repeated as H1) is the first entry', () => {
    const { element } = render('# Russian Alphabet\n\n## Overview', { title: 'Russian Alphabet' });
    expect(element.querySelector('h1')?.hasAttribute('hidden')).toBe(true);
    expect(buildToc(element).map((e) => e.text)).toEqual(['Russian Alphabet', 'Overview']);
  });
});
