import { afterEach, describe, expect, it, vi } from 'vitest';
import { codeOf } from '../../src/reader/code-blocks';
import { cleanup, frames, lineRects, mountBook, pagesOf, paragraphs, range } from './harness';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  vi.restoreAllMocks();
});

const SIZE = { width: 480, height: 340 } as const;
const tall = (lines: number) => '```c\n' + range(lines).map((i) => `/* ${String(i + 1).padStart(3, '0')} */ int v${i} = ${i};`).join('\n') + '\n```';
const wide = '```text\nSTART-' + 'w'.repeat(300) + '-END\nsecond line\n```';

const parts = (book: Awaited<ReturnType<typeof mountBook>>, index = 0) => {
  const pre = book.content.querySelectorAll('pre')[index];
  return { pre, code: pre.querySelector('code')! };
};

describe('code blocks never lose content', () => {
  it('a block that fits is shown whole: nothing to scroll, no tab stop, no scroll hint', async () => {
    const book = await mountBook(`${paragraphs(1)}\n\n\`\`\`c\nint x = 1;\n\`\`\``, SIZE);
    const { code } = parts(book);
    expect(code.scrollHeight).toBeLessThanOrEqual(code.clientHeight + 1);
    expect(code.scrollWidth).toBeLessThanOrEqual(code.clientWidth + 1);
    expect(code.hasAttribute('tabindex')).toBe(false);
    expect(code.hasAttribute('data-scrolls')).toBe(false);
  });

  it('a very tall block is exactly one page tall, scrolls vertically, and reaches both its first and last line', async () => {
    const book = await mountBook(`${paragraphs(1, 20)}\n\n${tall(200)}\n\nAfter.`, SIZE);
    const { pre, code } = parts(book);
    expect(pagesOf(book, pre)).toHaveLength(1);
    expect(pre.getBoundingClientRect().height).toBeLessThanOrEqual(book.paginator.pageSize.height + 1);
    expect(code.dataset.scrolls).toBe('y');

    const box = code.getBoundingClientRect();
    code.scrollTop = 0;
    expect(lineRects(code)[0].top).toBeGreaterThanOrEqual(box.top - 1);
    code.scrollTop = code.scrollHeight;
    expect(code.scrollTop + code.clientHeight).toBeGreaterThanOrEqual(code.scrollHeight - 1); // the end
    expect(lineRects(code).at(-1)!.bottom).toBeLessThanOrEqual(box.bottom + 1);
    expect(code.textContent).toContain('200 */'); // and it is all there
  });

  it('a block with very long lines scrolls sideways and does not wrap or widen the page', async () => {
    const book = await mountBook(`${wide}\n\nAfter.`, SIZE);
    const { pre, code } = parts(book);
    expect(pre.getBoundingClientRect().width).toBeLessThanOrEqual(book.paginator.pageSize.width + 1);
    expect(code.dataset.scrolls).toBe('x');
    expect(getComputedStyle(code).whiteSpace).toBe('pre');
    const box = code.getBoundingClientRect();
    code.scrollLeft = code.scrollWidth;
    const first = lineRects(code)[0];
    expect(first.right).toBeLessThanOrEqual(box.right + 1); // the end of the long line is reachable
    code.scrollLeft = 0;
    expect(lineRects(code)[0].left).toBeGreaterThanOrEqual(box.left - 1);
  });

  it('a block that is both tall and wide scrolls both ways', async () => {
    const lines = range(120).map((i) => `${String(i).padStart(3, '0')} ${'x'.repeat(120)}`).join('\n');
    const book = await mountBook('```\n' + lines + '\n```', SIZE);
    expect(parts(book).code.dataset.scrolls).toBe('both');
  });

  it('is recomputed when the page size changes: a block that stops fitting becomes scrollable, and the other way round', async () => {
    const book = await mountBook('```c\n' + range(14).map((i) => `int value_${i} = ${i};`).join('\n') + '\n```', { width: 480, height: 600 });
    const { code } = parts(book);
    expect(code.hasAttribute('tabindex')).toBe(false);
    await book.resize(480, 220);
    expect(code.hasAttribute('tabindex')).toBe(true);
    await book.resize(480, 600);
    expect(code.hasAttribute('tabindex')).toBe(false);
  });

  it('highlighting is intact in the part that is scrolled out of view', async () => {
    const book = await mountBook(tall(200), SIZE);
    const { code } = parts(book);
    expect(code.querySelectorAll('.hljs-type').length).toBe(200);
    expect(code.querySelectorAll('.hljs-comment').length).toBe(200);
    expect(code.querySelectorAll('.hljs-number').length).toBe(200);
  });

  it('is announced as scrollable (named group) and focusable only when it scrolls', async () => {
    const book = await mountBook(`${tall(200)}\n\n\`\`\`c\nint small;\n\`\`\``, SIZE);
    const [big, small] = [parts(book, 0).code, parts(book, 1).code];
    expect(big.getAttribute('role')).toBe('group');
    expect(big.getAttribute('aria-label')).toMatch(/scroll/i);
    expect(big.tabIndex).toBe(0);
    expect(small.hasAttribute('role')).toBe(false);
    expect(small.tabIndex).toBe(-1);
  });
});

describe('the Copy button', () => {
  it('copies all of the code, including what is scrolled out of view, and stays in place while the code scrolls', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
    const book = await mountBook(`${tall(200)}`, SIZE);
    const { pre, code } = parts(book);
    const button = pre.querySelector<HTMLButtonElement>('.code-copy')!;

    const before = button.getBoundingClientRect();
    code.scrollTop = code.scrollHeight;
    code.scrollLeft = 40;
    const after = button.getBoundingClientRect();
    expect(after.top).toBe(before.top); // it does not scroll away with the code
    expect(after.left).toBe(before.left);

    button.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toBe(codeOf(pre));
    expect(copied.split('\n')).toHaveLength(200);
    expect(copied.startsWith('/* 001 */')).toBe(true);
    expect(copied.endsWith('= 199;')).toBe(true);
    await vi.waitFor(() => expect(button.textContent).toBe('Copied'));
  });
});

describe('the three themes', () => {
  for (const theme of ['light', 'dark', 'sepia']) {
    it(`${theme}: the block, its colours and its scroll hints follow the theme, and the pages do not change`, async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      const book = await mountBook(`${paragraphs(2, 20)}\n\n${tall(200)}\n\n${wide}`, SIZE);
      const count = book.paginator.pageCount;
      const pages = [...book.content.querySelectorAll('pre')].map((pre) => pagesOf(book, pre).join());

      document.documentElement.setAttribute('data-theme', theme);
      await frames(2);
      expect(book.paginator.pageCount).toBe(count); // themes only change colours
      expect([...book.content.querySelectorAll('pre')].map((pre) => pagesOf(book, pre).join())).toEqual(pages);

      const { pre, code } = parts(book);
      const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
      expect(getComputedStyle(pre).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
      expect(getComputedStyle(code).backgroundImage).toContain('linear-gradient'); // the scroll hints
      expect(surface).not.toBe('');
      expect(getComputedStyle(code.querySelector('.hljs-number')!).color).not.toBe(getComputedStyle(code).color);
      expect(code.dataset.scrolls).toBe('y');
      expect(getComputedStyle(code).overflowY).toBe('auto');
    });
  }
});
