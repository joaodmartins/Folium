import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, codeBlock, frames, mountBook, pagesOf, paragraphs, pngImage, range } from './harness';

afterEach(cleanup);

// A heading must be on the page where the block after it starts. (Not the whole section: only the first block.)
// Pages here are small (single column of ~440 x 300) so that, sweeping the amount of text before a heading,
// the heading lands on every possible line of a page, including the last one.

const SIZE = { width: 480, height: 340 } as const;
const startPage = (book: Awaited<ReturnType<typeof mountBook>>, el: Element) => pagesOf(book, el)[0];

/** Headings that are on a different page than the block after them. */
function separated(book: Awaited<ReturnType<typeof mountBook>>): string[] {
  const out: string[] = [];
  for (const heading of book.content.querySelectorAll('h1, h2, h3')) {
    const next = heading.nextElementSibling;
    if (next && startPage(book, heading) !== startPage(book, next)) out.push(`${heading.tagName} "${heading.textContent}" → ${next.tagName}`);
  }
  return out;
}

/** What follows the heading, in the kinds of blocks the book has. */
const FOLLOWED_BY: Record<string, string> = {
  paragraph: paragraphs(2, 30, 70),
  list: range(5).map((i) => `- item ${i + 1} of the list`).join('\n'),
  code: codeBlock(6),
  table: ['| a | b |', '|---|---|', ...range(4).map((i) => `| r${i} | v${i} |`)].join('\n'),
  'consecutive headings': '#### A smaller heading right after\n\n' + paragraphs(1, 30, 80),
};

describe('headings stay with the text that follows them', () => {
  for (const [level, marks] of [['H1', '#'], ['H2', '##'], ['H3', '###']] as const) {
    for (const [kind, block] of Object.entries(FOLLOWED_BY)) {
      it(`${level} followed by ${kind}: never at the bottom of a page, wherever it falls`, async () => {
        for (const before of range(14)) {
          const book = await mountBook(`${paragraphs(before + 1, 22)}\n\n${marks} The heading\n\n${block}\n\n${paragraphs(3, 30, 90)}`, SIZE);
          expect(separated(book), `${before + 1} paragraphs before`).toEqual([]);
          cleanup();
        }
      });
    }
  }

  it('the sweep is meaningful: without the fix, headings do end up separated from their text', async () => {
    let separatedWithout = 0;
    for (const before of range(14)) {
      // the heading directly before a code block that is as tall as the page: it cannot be kept by CSS alone
      const book = await mountBook(`${paragraphs(before + 1, 22)}\n\n## The heading\n\n${codeBlock(11)}`, { ...SIZE, beforeMeasure: () => {} });
      separatedWithout += separated(book).length;
      cleanup();
    }
    expect(separatedWithout).toBeGreaterThan(0);
  });

  it('a heading and its code block fit on one page together, even when the code is taller than the page', async () => {
    for (const before of range(8)) {
      const book = await mountBook(`${paragraphs(before + 1, 22)}\n\n### Tall code\n\n${codeBlock(60)}\n\nAfter.`, SIZE);
      const heading = book.content.querySelector('h3')!;
      const pre = book.content.querySelector('pre')!;
      expect(pagesOf(book, pre), `${before + 1} paragraphs before`).toHaveLength(1);
      expect(startPage(book, heading)).toBe(startPage(book, pre));
      const room = book.paginator.pageSize.height;
      expect(heading.getBoundingClientRect().height + pre.getBoundingClientRect().height).toBeLessThanOrEqual(room + 1);
      cleanup();
    }
  });

  it('a picture right after a heading is scaled down to leave room for it', async () => {
    for (const before of range(6)) {
      const book = await mountBook(`${paragraphs(before + 1, 22)}\n\n## Picture\n\n${pngImage(300, 2400)}\n\nAfter.`, SIZE);
      const heading = book.content.querySelector('h2')!;
      const image = book.content.querySelector('img')!;
      expect(pagesOf(book, image), `${before + 1} paragraphs before`).toHaveLength(1);
      expect(startPage(book, heading)).toBe(startPage(book, image));
      expect(image.getBoundingClientRect().height).toBeLessThan(book.paginator.pageSize.height - heading.getBoundingClientRect().height);
      cleanup();
    }
  });

  it('does not keep whole sections together: a long section runs over many pages, with no gaps', async () => {
    const book = await mountBook(`# One section\n\n${paragraphs(30, 40)}`, SIZE);
    const heading = book.content.querySelector('h1')!;
    const last = book.content.querySelector('p:last-of-type')!;
    expect(startPage(book, last) - startPage(book, heading)).toBeGreaterThan(3); // the section continues on later pages
    // …and every page is full: only the last page may be short
    const { height } = book.paginator.pageSize;
    const bottoms = new Map<number, number>();
    for (const p of book.content.querySelectorAll('p')) {
      for (const r of p.getClientRects()) {
        const page = Math.floor((r.left - book.content.getBoundingClientRect().left + 1) / (book.paginator.pageSize.width + book.paginator.pageSize.gap));
        bottoms.set(page, Math.max(bottoms.get(page) ?? 0, r.bottom - book.content.getBoundingClientRect().top));
      }
    }
    for (const [page, bottom] of bottoms) if (page < book.paginator.pageCount - 1) expect(bottom, `page ${page}`).toBeGreaterThan(height * 0.8);
  });

  it('a heading that already starts a page is left there, and a book that needs no moves has the same pages with or without it', async () => {
    const text = `# One\n\n${paragraphs(2, 30)}\n\n## Two\n\n${paragraphs(2, 30, 5)}\n\n### Three\n\n${paragraphs(2, 30, 9)}`;
    const withKeep = await mountBook(text, { ...SIZE, width: 700, height: 900 });
    const without = await mountBook(text, { ...SIZE, width: 700, height: 900, beforeMeasure: () => {} });
    expect(withKeep.paginator.pageCount).toBe(without.paginator.pageCount);
    expect(withKeep.content.querySelectorAll('.keep-start')).toHaveLength(0); // nothing had to be moved
  });

  it('does not waste pages: moving headings costs at most one short page each', async () => {
    const text = range(10).map((i) => `## Section ${i + 1}\n\n${paragraphs(2, 38, i * 2 + 1)}`).join('\n\n');
    const withKeep = await mountBook(text, SIZE);
    const without = await mountBook(text, { ...SIZE, beforeMeasure: () => {} });
    expect(separated(withKeep)).toEqual([]);
    expect(withKeep.paginator.pageCount).toBeLessThanOrEqual(without.paginator.pageCount + 10);
  });

  describe('manual page breaks, chapter breaks and navigation are respected', () => {
    it('a heading followed by a manual page break stays where the author put it', async () => {
      const book = await mountBook(`${paragraphs(2, 20)}\n\n## Part title\n\n<!-- pagebreak -->\n\n${paragraphs(2, 20, 5)}`, SIZE);
      const heading = book.content.querySelector('h2')!;
      expect(startPage(book, heading)).toBeLessThan(startPage(book, heading.nextElementSibling!)); // the break is the author's
      expect(book.content.querySelectorAll('.keep-start')).toHaveLength(0);
    });

    it('chapters (chapterBreak) still start at the top of a page, and their first block is on the same page', async () => {
      const text = range(5).map((i) => `# Chapter ${i + 1}\n\n${paragraphs(2, 25, i * 2 + 1)}`).join('\n\n');
      const book = await mountBook(text, { ...SIZE, chapterBreak: 'h1' });
      expect(separated(book)).toEqual([]);
      for (const h of book.content.querySelectorAll('h1')) {
        const top = h.getBoundingClientRect().top - book.content.getBoundingClientRect().top;
        expect(Math.abs(top)).toBeLessThan(2);
      }
    });

    it('heading navigation (the table of contents) lands on the page that shows the heading with its text', async () => {
      const text = range(12).map((i) => `## Section ${i + 1}\n\n${paragraphs(2, 30, i * 2 + 1)}`).join('\n\n');
      const book = await mountBook(text, SIZE);
      for (const heading of book.content.querySelectorAll('h2')) {
        book.paginator.goToElement(heading);
        await frames(1);
        expect(book.paginator.page).toBe(startPage(book, heading));
        expect(startPage(book, heading.nextElementSibling!)).toBe(book.paginator.page);
      }
    });
  });

  it('is laid out again from scratch when the size changes: still no separated headings', async () => {
    const text = range(14).map((i) => `### Heading ${i + 1}\n\n${paragraphs(1, 28, i + 1)}\n\n${codeBlock(3 + (i % 5))}`).join('\n\n');
    const book = await mountBook(text, SIZE);
    for (const [w, h] of [[400, 300], [520, 380], [460, 460], [640, 320]] as const) {
      await book.resize(w, h);
      expect(separated(book), `${w}x${h}`).toEqual([]);
    }
  });
});
