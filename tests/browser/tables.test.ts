import { afterEach, describe, expect, it } from 'vitest';
import { renderFace } from '../../src/reader/flip/faces';
import { cleanup, frames, mountBook, pagesOf, paragraphs, range, wordsOfFace, wordsOfRealPage } from './harness';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

const SIZE = { width: 480, height: 340 } as const;
type Book = Awaited<ReturnType<typeof mountBook>>;

const table = (head: string[], rows: string[][]) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const grid = (columns: number, rows: number, cell = (r: number, c: number) => `r${r}c${c}`) =>
  table(range(columns).map((c) => `H${c + 1}`), range(rows).map((r) => range(columns).map((c) => cell(r + 1, c + 1))));

const wrapOf = (book: Book, index = 0) => book.content.querySelectorAll<HTMLElement>('.table-wrap')[index];
const startPage = (book: Book, el: Element) => pagesOf(book, el)[0];

describe('a table that fits is left alone', () => {
  it('has nothing to scroll, no tab stop, no hint, no fixed size, and shows all of itself', async () => {
    const book = await mountBook(`${paragraphs(1, 20)}\n\n${grid(2, 3)}`, SIZE);
    const wrap = wrapOf(book);
    expect(wrap.scrollWidth).toBeLessThanOrEqual(wrap.clientWidth + 1);
    expect(wrap.scrollHeight).toBeLessThanOrEqual(wrap.clientHeight + 1);
    for (const attribute of ['tabindex', 'role', 'aria-label', 'data-scrolls']) expect(wrap.hasAttribute(attribute), attribute).toBe(false);
    expect(wrap.getAttribute('style')).toBeNull();
    // the table fills the page width, as it always did, and its box is as tall as its rows
    expect(wrap.querySelector('table')!.getBoundingClientRect().width).toBeCloseTo(wrap.clientWidth, 0);
    expect(wrap.getBoundingClientRect().height).toBeCloseTo(wrap.querySelector('table')!.getBoundingClientRect().height, 0);
  });
});

describe('tables that are bigger than the page scroll inside themselves', () => {
  it('many columns: scrolls sideways, keeps readable columns, and the last column can be reached', async () => {
    const book = await mountBook(grid(12, 4), SIZE);
    const wrap = wrapOf(book);
    expect(wrap.dataset.scrolls).toBe('x');
    expect(wrap.getBoundingClientRect().width).toBeLessThanOrEqual(book.content.offsetWidth + 1); // the page does not widen
    for (const th of wrap.querySelectorAll('th')) expect(th.getBoundingClientRect().width).toBeGreaterThanOrEqual(70);
    wrap.scrollLeft = wrap.scrollWidth;
    const box = wrap.getBoundingClientRect();
    const last = wrap.querySelector('tbody tr:last-child td:last-child')!.getBoundingClientRect();
    expect(last.right).toBeLessThanOrEqual(box.right + 1);
    expect(last.left).toBeGreaterThanOrEqual(box.left - 1);
    expect(wrap.querySelector('tbody tr:last-child td:last-child')!.textContent).toBe('r4c12');
  });

  it('many rows: scrolls down, is no taller than the page, and the last row can be reached', async () => {
    const book = await mountBook(`${paragraphs(1, 20)}\n\n${grid(3, 80)}\n\nAfter.`, SIZE);
    const wrap = wrapOf(book);
    expect(wrap.dataset.scrolls).toBe('y');
    expect(pagesOf(book, wrap)).toHaveLength(1);
    expect(wrap.getBoundingClientRect().height).toBeLessThanOrEqual(book.paginator.pageSize.height + 1);
    wrap.scrollTop = wrap.scrollHeight;
    expect(wrap.querySelector('tbody tr:last-child')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(wrap.getBoundingClientRect().bottom + 1);
  });

  it('wide and tall: scrolls both ways, and the bottom-right cell can be reached', async () => {
    const book = await mountBook(grid(10, 70), SIZE);
    const wrap = wrapOf(book);
    expect(wrap.dataset.scrolls).toBe('both');
    wrap.scrollTo(wrap.scrollWidth, wrap.scrollHeight);
    const cell = wrap.querySelector('tbody tr:last-child td:last-child')!.getBoundingClientRect();
    const box = wrap.getBoundingClientRect();
    expect(cell.right).toBeLessThanOrEqual(box.right + 1);
    expect(cell.bottom).toBeLessThanOrEqual(box.bottom + 1);
  });

  it('the header row stays in view while the rows scroll under it, and the first rows can be seen again', async () => {
    const book = await mountBook(grid(3, 80), SIZE);
    const wrap = wrapOf(book);
    const header = wrap.querySelector('th')!;
    const top = () => header.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
    expect(Math.abs(top())).toBeLessThan(2);
    wrap.scrollTop = 600;
    expect(Math.abs(top())).toBeLessThan(2); // still at the top of the box, with rows going under it
    expect(getComputedStyle(header).position).toBe('sticky');
    expect(getComputedStyle(header).backgroundColor).not.toBe('rgba(0, 0, 0, 0)'); // opaque: rows do not show through
    const row = wrap.querySelector('tbody tr:nth-child(40)')!;
    wrap.scrollTop = row.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop - header.getBoundingClientRect().height;
    expect(row.getBoundingClientRect().top).toBeGreaterThanOrEqual(header.getBoundingClientRect().bottom - 1); // not hidden behind the header
    wrap.scrollTop = 0;
    expect(wrap.querySelector('tbody tr:first-child')!.getBoundingClientRect().top).toBeGreaterThanOrEqual(header.getBoundingClientRect().bottom - 1);
  });

  it('long text in cells wraps (no sideways scroll needed) and the row grows', async () => {
    const text = 'a deliberately long explanation that keeps going '.repeat(5);
    const book = await mountBook(table(['Term', 'Meaning'], [['short', text], ['other', 'x']]), { width: 480, height: 600 });
    const wrap = wrapOf(book);
    expect(wrap.scrollWidth).toBeLessThanOrEqual(wrap.clientWidth + 1);
    const [first, second] = [...wrap.querySelectorAll('tbody tr')].map((r) => r.getBoundingClientRect().height);
    expect(first).toBeGreaterThan(second * 2);
    expect(wrap.querySelector('td:nth-child(2)')!.textContent).toBe(text.trim());
  });

  it('columns of long text keep a readable width: the table scrolls instead of squeezing them', async () => {
    const prose = 'Each of these cells holds a whole sentence of ordinary prose, long enough to need room.';
    const book = await mountBook(table(['One', 'Two', 'Three', 'Four'], [[prose, prose, prose, prose]]), { width: 400, height: 500 });
    const wrap = wrapOf(book);
    expect(wrap.dataset.scrolls).toBe('x');
    for (const td of wrap.querySelectorAll('td')) expect(td.getBoundingClientRect().width).toBeGreaterThanOrEqual(150);
  });

  it('code and formatting in cells are intact, and in the last column they can be reached', async () => {
    const book = await mountBook(
      table(['Call', 'Does', 'Returns', 'Notes', 'More'], [['`execlp(prog, argv0, arg1, ..., NULL)`', '**Replaces** the program, *keeping* the [PID](https://example.com)', '`-1` on failure', 'a note', '**LAST-CELL**']]),
      { width: 400, height: 500 },
    );
    const wrap = wrapOf(book);
    expect(wrap.querySelector('td code')!.textContent).toBe('execlp(prog, argv0, arg1, ..., NULL)');
    expect(wrap.querySelector('td strong')).not.toBeNull();
    expect(wrap.querySelector('td em')).not.toBeNull();
    expect(wrap.querySelector('td a')!.getAttribute('href')).toBe('https://example.com');
    wrap.scrollLeft = wrap.scrollWidth;
    const last = wrap.querySelector('td:last-child strong')!.getBoundingClientRect();
    expect(last.right).toBeLessThanOrEqual(wrap.getBoundingClientRect().right + 1);
  });
});

describe('keyboard and screen readers', () => {
  it('a table that scrolls is a focusable, named group that says how it scrolls; one that fits is neither', async () => {
    const book = await mountBook(`${grid(12, 4)}\n\n${grid(3, 80)}\n\n${grid(10, 70)}\n\n${grid(2, 2)}`, SIZE);
    const [wide, tall, both, small] = [0, 1, 2, 3].map((i) => wrapOf(book, i));
    expect(wide.getAttribute('aria-label')).toBe('Table, 5 rows by 12 columns: scrolls sideways');
    expect(tall.getAttribute('aria-label')).toBe('Table, 81 rows by 3 columns: scrolls down');
    expect(both.getAttribute('aria-label')).toBe('Table, 71 rows by 10 columns: scrolls sideways and down');
    for (const wrap of [wide, tall, both]) {
      expect(wrap.getAttribute('role')).toBe('group');
      expect(wrap.tabIndex).toBe(0);
    }
    expect(small.tabIndex).toBe(-1);
    expect(small.hasAttribute('aria-label')).toBe(false);
    expect(wide.querySelector('table')!.getAttribute('role')).toBeNull(); // the table inside keeps its own semantics
  });

  it('is recomputed when the page size changes', async () => {
    const book = await mountBook(grid(4, 8), { width: 600, height: 600 });
    const wrap = wrapOf(book);
    expect(wrap.hasAttribute('tabindex')).toBe(false);
    await book.resize(360, 220);
    expect(wrap.hasAttribute('tabindex')).toBe(true);
    await book.resize(600, 600);
    expect(wrap.hasAttribute('tabindex')).toBe(false);
    expect(wrap.hasAttribute('aria-label')).toBe(false);
  });
});

describe('tables and the pages', () => {
  it('a table that does not fit in the room left on a page moves to the next one, whole', async () => {
    let moved = 0;
    for (const before of range(8)) {
      const book = await mountBook(`${paragraphs(before + 1, 22)}\n\n${grid(3, 6)}\n\nAfter.`, SIZE);
      const wrap = wrapOf(book);
      expect(pagesOf(book, wrap), `${before + 1} paragraphs before`).toHaveLength(1);
      const top = wrap.getBoundingClientRect().top - book.content.getBoundingClientRect().top;
      if (startPage(book, wrap) > 0 && top < 2) moved++; // it starts a page of its own, below text that ends the page before
      cleanup();
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('headings before a table stay with it: never alone at the bottom of a page', async () => {
    for (const marks of ['#', '##', '###']) {
      for (const before of range(10)) {
        const book = await mountBook(`${paragraphs(before + 1, 22)}\n\n${marks} The heading\n\n${grid(3, 5)}\n\n${paragraphs(2, 30, 60)}`, SIZE);
        const heading = book.content.querySelector('h1, h2, h3')!;
        expect(startPage(book, heading), `${marks}, ${before + 1} paragraphs before`).toBe(startPage(book, wrapOf(book)));
        cleanup();
      }
    }
  });

  it('a heading and a table taller than the page fit together: the table is capped to the room after the heading', async () => {
    for (const before of range(6)) {
      const book = await mountBook(`${paragraphs(before + 1, 22)}\n\n## Tall table\n\n${grid(3, 80)}\n\nAfter.`, SIZE);
      const heading = book.content.querySelector('h2')!;
      const wrap = wrapOf(book);
      expect(startPage(book, heading), `${before + 1} paragraphs before`).toBe(startPage(book, wrap));
      expect(heading.getBoundingClientRect().height + wrap.getBoundingClientRect().height).toBeLessThanOrEqual(book.paginator.pageSize.height + 1);
      expect(wrap.dataset.scrolls).toBe('y');
      cleanup();
    }
  });

  it('a table followed by a heading: the heading keeps its own text with it', async () => {
    for (const before of range(6)) {
      const book = await mountBook(`${grid(3, before + 2)}\n\n## After the table\n\n${paragraphs(2, 30)}`, SIZE);
      const heading = book.content.querySelector('h2')!;
      expect(startPage(book, heading), `${before + 2} rows`).toBe(startPage(book, heading.nextElementSibling!));
      cleanup();
    }
  });

  it('manual page breaks and chapter breaks work around tables', async () => {
    const manual = await mountBook(`${paragraphs(1, 20)}\n\n<!-- pagebreak -->\n\n${grid(3, 4)}\n\n<!-- pagebreak -->\n\n${paragraphs(1, 20, 5)}`, SIZE);
    expect(manual.paginator.pageCount).toBe(3);
    expect(startPage(manual, wrapOf(manual))).toBe(1);
    expect(manual.content.querySelectorAll('.keep-start')).toHaveLength(0);

    const chapters = await mountBook(range(3).map((i) => `# Chapter ${i + 1}\n\n${grid(3, 4)}`).join('\n\n'), { ...SIZE, chapterBreak: 'h1' });
    expect([...chapters.content.querySelectorAll('h1')].map((h) => startPage(chapters, h))).toEqual([0, 1, 2]);
    for (const [i, h] of [...chapters.content.querySelectorAll('h1')].entries()) expect(startPage(chapters, wrapOf(chapters, i))).toBe(startPage(chapters, h));
  });

  it('navigating to a heading above a table (the table of contents) shows the heading with the table', async () => {
    const book = await mountBook(range(8).map((i) => `## Section ${i + 1}\n\n${grid(3, 5 + i)}`).join('\n\n'), SIZE);
    for (const heading of book.content.querySelectorAll('h2')) {
      book.paginator.goToElement(heading);
      await frames(1);
      expect(book.paginator.page).toBe(startPage(book, heading));
      expect(startPage(book, heading.nextElementSibling!)).toBe(book.paginator.page);
    }
  });

  it('the copies drawn while a page turns show exactly the table that is on the real page', async () => {
    const book = await mountBook(`${paragraphs(2, 25)}\n\n${grid(3, 60)}\n\n${grid(12, 4)}\n\n${paragraphs(3, 25, 20)}`, { pages: 2, width: 900, height: 420 });
    const size = book.paginator.pageSize;
    const paper = { width: book.layout.pageWidth, height: book.layout.pageHeight, textLeft: book.layout.marginX, textTop: book.layout.marginY };
    for (let page = 0; page < book.paginator.pageCount; page++) {
      const face = renderFace(book.content, page, size, paper, 'flip__face--still')!;
      expect(face, `page ${page} can be copied`).not.toBeNull();
      book.frame.flipLayer.replaceChildren(face);
      await frames(1);
      expect(wordsOfFace(face), `copy of page ${page}`).toEqual(wordsOfRealPage(book, page));
    }
  });
});

describe('the three themes', () => {
  for (const theme of ['light', 'dark', 'sepia']) {
    it(`${theme}: header, hints and text follow the theme, and the pages do not change`, async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      const book = await mountBook(`${paragraphs(1, 20)}\n\n${grid(10, 70)}\n\n${grid(2, 3)}`, SIZE);
      const count = book.paginator.pageCount;
      const pages = [...book.content.querySelectorAll('.table-wrap')].map((w) => pagesOf(book, w).join());
      document.documentElement.setAttribute('data-theme', theme);
      await frames(2);
      expect(book.paginator.pageCount).toBe(count); // themes only change colours
      expect([...book.content.querySelectorAll('.table-wrap')].map((w) => pagesOf(book, w).join())).toEqual(pages);

      const wrap = wrapOf(book);
      const header = wrap.querySelector('th')!;
      expect(getComputedStyle(wrap).backgroundImage).toContain('linear-gradient'); // the scroll hints
      expect(getComputedStyle(header).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
      expect(getComputedStyle(header).color).not.toBe(getComputedStyle(header).backgroundColor);
      expect(getComputedStyle(wrap.querySelector('td')!).borderBottomColor).not.toBe('rgba(0, 0, 0, 0)');
    });
  }
});
