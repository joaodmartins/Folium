import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, mountBook, pagesOf, paragraphs, range } from './harness';

afterEach(cleanup);

// Regression tests from the stability audit: blocks that do not fit a page must never be cut off.

const SIZE = { width: 480, height: 340 } as const;
const tallFormula = (lines: number) => '$$\\begin{aligned}' + range(lines).map((i) => `a_{${i}} &= b_{${i}} + c_{${i}}`).join('\\\\') + '\\end{aligned}$$';

describe('a display formula taller than the page', () => {
  it('is no taller than the page and scrolls down to its last line, instead of being cut off', async () => {
    const book = await mountBook(`Intro.\n\n${tallFormula(40)}\n\nAfter.`, SIZE);
    const formula = book.content.querySelector<HTMLElement>('.katex-display')!;
    expect(formula.getBoundingClientRect().height).toBeLessThanOrEqual(book.paginator.pageSize.height + 1);
    expect(pagesOf(book, formula)).toHaveLength(1);
    expect(formula.scrollHeight).toBeGreaterThan(formula.clientHeight);
    expect(formula.hasAttribute('data-scroll-y')).toBe(true);
    expect(getComputedStyle(formula).overflowY).toBe('auto');
    expect(formula.tabIndex).toBe(0);
    expect(formula.getAttribute('aria-label')).toMatch(/scrolls down/);
    formula.scrollTop = formula.scrollHeight;
    expect(formula.scrollTop + formula.clientHeight).toBeGreaterThanOrEqual(formula.scrollHeight - 1);
  });

  it('formulas that fit are left alone: no scroll bar, no tab stop', async () => {
    const book = await mountBook('Inline $x^2$ and\n\n$$\\int_a^b f(x)\\,dx = \\sum_{i=0}^{n} \\frac{a_i}{b_i}$$\n\nAfter.', SIZE);
    const formula = book.content.querySelector<HTMLElement>('.katex-display')!;
    expect(formula.hasAttribute('tabindex')).toBe(false);
    expect(formula.hasAttribute('data-scroll-y')).toBe(false);
    expect(getComputedStyle(formula).overflowY).toBe('hidden');
  });

  it('a heading before it stays with it', async () => {
    for (const before of range(6)) {
      const book = await mountBook(`${paragraphs(before + 1, 22)}\n\n## Derivation\n\n${tallFormula(40)}\n\nAfter.`, SIZE);
      const heading = book.content.querySelector('h2')!;
      const formula = book.content.querySelector('.katex-display')!;
      expect(pagesOf(book, heading)[0], `${before + 1} paragraphs before`).toBe(pagesOf(book, formula)[0]);
      expect(heading.getBoundingClientRect().height + formula.getBoundingClientRect().height).toBeLessThanOrEqual(book.paginator.pageSize.height + 1);
      cleanup();
    }
  });
});

describe('code inside a list item', () => {
  it('is capped to a page and scrolls, like any other block of code', async () => {
    const code = range(60).map((i) => `  int x${i};`).join('\n');
    const book = await mountBook(`- parent\n\n  \`\`\`c\n${code}\n  \`\`\`\n\n  tail\n`, SIZE);
    const pre = book.content.querySelector('li pre')!;
    expect(pagesOf(book, pre)).toHaveLength(1);
    expect(pre.getBoundingClientRect().height).toBeLessThanOrEqual(book.paginator.pageSize.height + 1);
    expect(pre.querySelector('code')!.dataset.scrolls).toBe('y');
  });
});
