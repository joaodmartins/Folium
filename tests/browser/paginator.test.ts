import { afterEach, describe, expect, it } from 'vitest';
import type { PageState } from '../../src/reader/paginator/types';
import {
  cleanup,
  codeBlock,
  fragmentsOf,
  frames,
  geometry,
  lineRects,
  mountBook,
  pageOfRect,
  pagesOf,
  paragraphs,
  range,
  pngImage,
  visibleFragments,
} from './harness';

afterEach(cleanup);

const allBlocks = (root: HTMLElement) => [...root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, td, th')];

describe('page count', () => {
  it('short content fits one page', async () => {
    const book = await mountBook('Just one short paragraph.');
    expect(book.paginator.pageCount).toBe(1);
    expect(book.paginator.page).toBe(0);
  });

  it('long content flows into several pages', async () => {
    const book = await mountBook(paragraphs(40));
    expect(book.paginator.pageCount).toBeGreaterThan(2);
  });

  it('matches the content: the last paragraph is on the last page, and no page is empty', async () => {
    const book = await mountBook(paragraphs(40));
    const geo = geometry(book);
    const paragraphsEls = [...book.content.querySelectorAll('p')];
    const lastFragment = fragmentsOf(paragraphsEls.at(-1)!).at(-1)!;
    expect(book.paginator.pageCount).toBe(pageOfRect(book, lastFragment) + 1);
    expect(geo.step).toBeGreaterThan(book.content.offsetWidth);

    const covered = new Set(paragraphsEls.flatMap((p) => fragmentsOf(p).map((r) => pageOfRect(book, r))));
    expect([...covered].sort((a, b) => a - b)).toEqual(range(book.paginator.pageCount));
  });

  it('grows with the amount of content', async () => {
    const small = await mountBook(paragraphs(10));
    const large = await mountBook(paragraphs(60));
    expect(large.paginator.pageCount).toBeGreaterThan(small.paginator.pageCount);
  });

  it('a taller or wider page needs fewer pages', async () => {
    const compact = await mountBook(paragraphs(30), { width: 360, height: 360 });
    const roomy = await mountBook(paragraphs(30), { width: 640, height: 640 });
    expect(roomy.paginator.pageCount).toBeLessThan(compact.paginator.pageCount);
  });

  it('is 1 for an empty book', async () => {
    const book = await mountBook('');
    expect(book.paginator.pageCount).toBe(1);
  });

  it('pageOf agrees with the measured geometry', async () => {
    const book = await mountBook(paragraphs(40));
    for (const p of book.content.querySelectorAll('p')) {
      expect(book.paginator.pageOf(p)).toBe(Math.min(pagesOf(book, p)[0], book.paginator.pageCount - 1));
    }
  });
});

describe('navigation', () => {
  it('starts on the first page and moves forward and back', async () => {
    const book = await mountBook(paragraphs(40));
    const { paginator } = book;
    expect(paginator.page).toBe(0);
    expect(paginator.prev()).toBe(false);
    expect(paginator.next()).toBe(true);
    expect(paginator.page).toBe(1);
    expect(paginator.next()).toBe(true);
    expect(paginator.page).toBe(2);
    expect(paginator.prev()).toBe(true);
    expect(paginator.page).toBe(1);
  });

  it('stops at the first and the last page', async () => {
    const book = await mountBook(paragraphs(40));
    const { paginator } = book;
    for (let i = 0; i < paginator.pageCount + 3; i++) paginator.next();
    expect(paginator.page).toBe(paginator.pageCount - 1);
    expect(paginator.next()).toBe(false);
    expect(paginator.page).toBe(paginator.pageCount - 1);
    for (let i = 0; i < paginator.pageCount + 3; i++) paginator.prev();
    expect(paginator.page).toBe(0);
    expect(paginator.prev()).toBe(false);
  });

  it('goes straight to a page, clamping out-of-range values', async () => {
    const book = await mountBook(paragraphs(40));
    const { paginator } = book;
    paginator.goTo(2);
    expect(paginator.page).toBe(2);
    paginator.goTo(999);
    expect(paginator.page).toBe(paginator.pageCount - 1);
    paginator.goTo(-4);
    expect(paginator.page).toBe(0);
    paginator.goTo(1.9);
    expect(paginator.page).toBe(1);
    paginator.goTo(Number.NaN);
    expect(paginator.page).toBe(0);
  });

  it('shows the page it says it shows (the content is moved to it)', async () => {
    const book = await mountBook(paragraphs(40));
    for (const target of [0, 2, 1, book.paginator.pageCount - 1]) {
      book.paginator.goTo(target);
      const onScreen = [...book.content.querySelectorAll('p')].filter((p) => visibleFragments(book, p).length > 0);
      expect(onScreen.length).toBeGreaterThan(0);
      for (const p of onScreen) expect(pagesOf(book, p)).toContain(target); // nothing from other pages leaks in
    }
  });

  it('notifies listeners about page and page-count changes, until they unsubscribe', async () => {
    const book = await mountBook(paragraphs(40));
    const states: PageState[] = [];
    const off = book.paginator.onChange((s) => states.push(s));
    book.paginator.next();
    book.paginator.goTo(3);
    book.paginator.goTo(3); // no change → no event
    expect(states).toEqual([
      { page: 1, pageCount: book.paginator.pageCount },
      { page: 3, pageCount: book.paginator.pageCount },
    ]);
    off();
    book.paginator.prev();
    expect(states).toHaveLength(2);
  });

  it('updates the page indicator and the buttons of the sheet', async () => {
    const book = await mountBook(paragraphs(40));
    const indicator = book.bar.indicator.root;
    const prev = book.bar.prevButton;
    const next = book.bar.nextButton;
    const count = book.paginator.pageCount;

    expect(indicator.textContent).toBe(`1 / ${count}`);
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    book.paginator.goTo(count - 1);
    expect(indicator.textContent).toBe(`${count} / ${count}`);
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(true);
  });

  it('a one-page book has both buttons disabled', async () => {
    const book = await mountBook('short');
    expect(book.bar.prevButton.disabled).toBe(true);
    expect(book.bar.nextButton.disabled).toBe(true);
    expect(book.bar.indicator.root.textContent).toBe('1 / 1');
  });

  it('stops reacting after destroy()', async () => {
    const book = await mountBook(paragraphs(40));
    const states: PageState[] = [];
    book.paginator.onChange((s) => states.push(s));
    book.paginator.destroy();
    await book.resize(300, 300);
    expect(states).toEqual([]);
  });
});

describe('headings', () => {
  const md = (level: number) => range(6).map((i) => `${'#'.repeat(level)} Section ${i + 1}\n\n${paragraphs(5, 40, i * 5 + 1)}`).join('\n\n');

  it('goToElement shows the page that holds the heading, with the heading on screen', async () => {
    const book = await mountBook(md(2));
    const headings = [...book.content.querySelectorAll('h2')];
    for (const heading of headings.reverse()) {
      book.paginator.goToElement(heading);
      expect(book.paginator.page).toBe(book.paginator.pageOf(heading));
      expect(visibleFragments(book, heading).length).toBeGreaterThan(0);
    }
  });

  it('works for headings after the paginator was created and for the last heading', async () => {
    const book = await mountBook(md(3));
    const last = [...book.content.querySelectorAll('h3')].at(-1)!;
    book.paginator.goToElement(last);
    expect(book.paginator.page).toBeGreaterThan(0);
    expect(visibleFragments(book, last).length).toBeGreaterThan(0);
  });

  it('never leaves a heading alone at the bottom of a page', async () => {
    // Try many amounts of text before the heading, so the heading lands at different heights.
    for (const before of range(14)) {
      const book = await mountBook(`${paragraphs(before + 1, 30)}\n\n## Heading\n\n${paragraphs(6, 30, 50)}`);
      const heading = book.content.querySelector('h2')!;
      const following = heading.nextElementSibling!;
      expect(pagesOf(book, heading)[0], `${before} paragraphs before`).toBe(pagesOf(book, following)[0]);
      cleanup();
    }
  });

  it('goToElement on a hidden element falls back to the first page instead of failing', async () => {
    const book = await mountBook('# Russian Alphabet\n\ntext', { chapterBreak: 'h1' });
    book.content.querySelector('h1')?.setAttribute('hidden', '');
    book.paginator.goToElement(book.content.querySelector('h1')!);
    expect(book.paginator.page).toBe(0);
  });
});

describe('manual page breaks (<!-- pagebreak -->)', () => {
  const pageOfText = (book: Awaited<ReturnType<typeof mountBook>>, start: string) => {
    const el = [...book.content.querySelectorAll('p, h1, h2, h3')].find((e) => e.textContent?.startsWith(start))!;
    return pagesOf(book, el)[0];
  };

  it('starts a new page, and the instruction itself is invisible', async () => {
    const book = await mountBook('First page text.\n\n<!-- pagebreak -->\n\nSecond page text.');
    expect(book.paginator.pageCount).toBe(2);
    expect(pageOfText(book, 'First')).toBe(0);
    expect(pageOfText(book, 'Second')).toBe(1);
    expect(book.content.textContent).not.toMatch(/pagebreak/i);
    expect(book.content.querySelector('.pagebreak')).toBeNull();
  });

  it('works anywhere in the document, with several breaks', async () => {
    const book = await mountBook('A\n\n<!-- pagebreak -->\n\nB\n\n<!-- pagebreak -->\n\nC\n\n<!-- pagebreak -->\n\nD');
    expect(book.paginator.pageCount).toBe(4);
    expect(['A', 'B', 'C', 'D'].map((t) => pageOfText(book, t))).toEqual([0, 1, 2, 3]);
  });

  it('breaks in the middle of long content: the next block starts exactly at the top of a page', async () => {
    const book = await mountBook(`${paragraphs(3)}\n\n<!-- pagebreak -->\n\n${paragraphs(3, 40, 10)}`);
    const first = [...book.content.querySelectorAll('p')].find((p) => p.textContent?.startsWith('P10'))!;
    const { left, step } = geometry(book);
    const x = first.getBoundingClientRect().left - left;
    expect(Math.abs(x / step - Math.round(x / step))).toBeLessThan(0.01); // at the left edge of a page
    expect(pagesOf(book, first)[0]).toBeGreaterThan(0);
  });

  it('does not create empty pages for leading, trailing or repeated breaks', async () => {
    const plain = await mountBook('A\n\n<!-- pagebreak -->\n\nB');
    const messy = await mountBook(
      '<!-- pagebreak -->\n\n<!-- pagebreak -->\n\nA\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->\n\n<!--pagebreak-->\n\nB\n\n<!-- pagebreak -->\n\n<!-- PAGEBREAK -->',
    );
    expect(plain.paginator.pageCount).toBe(2);
    expect(messy.paginator.pageCount).toBe(2);
    expect(pageOfText(messy, 'A')).toBe(0);
    expect(pageOfText(messy, 'B')).toBe(1);
  });

  it('is compatible with automatic pagination: long sections flow over several pages, then the break', async () => {
    const book = await mountBook(`${paragraphs(25)}\n\n<!-- pagebreak -->\n\n${paragraphs(25, 40, 100)}`);
    const before = [...book.content.querySelectorAll('p')].find((p) => p.textContent?.startsWith('P25'))!;
    const after = [...book.content.querySelectorAll('p')].find((p) => p.textContent?.startsWith('P100'))!;
    expect(pagesOf(book, before).at(-1)!).toBeLessThan(pagesOf(book, after)[0]);
    const covered = new Set([...book.content.querySelectorAll('p')].flatMap((p) => pagesOf(book, p)));
    expect(covered.size).toBe(book.paginator.pageCount); // no empty page anywhere
  });

  it('works inside a list or a quote: the following block starts a page', async () => {
    const book = await mountBook('> quoted\n>\n> <!-- pagebreak -->\n>\n> still quoted\n\nafter');
    expect(book.paginator.pageCount).toBe(2);
  });
});

describe('chapter breaks (chapterBreak)', () => {
  const doc =
    '# Part one\n\nIntro text.\n\n## Chapter A\n\nText A.\n\n## Chapter B\n\nText B.\n\n# Part two\n\n## Chapter C\n\nText C.';
  const pageOfHeading = (book: Awaited<ReturnType<typeof mountBook>>, text: string) =>
    pagesOf(book, [...book.content.querySelectorAll('h1,h2')].find((h) => h.textContent === text)!)[0];

  it('"h1": every H1 starts a page', async () => {
    const book = await mountBook(doc, { chapterBreak: 'h1' });
    expect(book.paginator.pageCount).toBe(2);
    expect(pageOfHeading(book, 'Part one')).toBe(0);
    expect(pageOfHeading(book, 'Part two')).toBe(1);
    expect(pageOfHeading(book, 'Chapter A')).toBe(0); // H2 does not break
  });

  it('"h2": H1 and H2 start pages, but a chapter right after its part title stays with it', async () => {
    const book = await mountBook(doc, { chapterBreak: 'h2' });
    expect(['Part one', 'Chapter A', 'Chapter B', 'Part two', 'Chapter C'].map((t) => pageOfHeading(book, t))).toEqual([0, 1, 2, 3, 3]);
    expect(book.paginator.pageCount).toBe(4);
  });

  it('"none": no forced breaks', async () => {
    const book = await mountBook(doc, { chapterBreak: 'none', width: 600, height: 900 });
    expect(book.paginator.pageCount).toBe(1);
  });

  it('does not leave an empty first page when the book starts with a heading', async () => {
    const book = await mountBook('# Title\n\nText\n\n# Next\n\nText', { chapterBreak: 'h1' });
    expect(pageOfHeading(book, 'Title')).toBe(0);
    expect(book.paginator.pageCount).toBe(2);
  });

  it('does not add a second break where a manual one already is', async () => {
    const book = await mountBook('One\n\n<!-- pagebreak -->\n\n# Two\n\ntext', { chapterBreak: 'h1' });
    expect(book.paginator.pageCount).toBe(2);
  });

  it('chapter headings start exactly at the top-left of a page', async () => {
    const book = await mountBook(`# One\n\n${paragraphs(2)}\n\n# Two\n\n${paragraphs(2)}\n\n# Three\n\n${paragraphs(2)}`, { chapterBreak: 'h1' });
    const { left, step } = geometry(book);
    for (const h of book.content.querySelectorAll('h1')) {
      const x = h.getBoundingClientRect().left - left;
      expect(Math.abs(x / step - Math.round(x / step))).toBeLessThan(0.01);
    }
    expect(book.paginator.pageCount).toBeGreaterThanOrEqual(3);
  });

  it('is the same after repaginating (resize)', async () => {
    const book = await mountBook(doc, { chapterBreak: 'h2' });
    await book.resize(380, 520);
    expect(['Part one', 'Chapter A', 'Chapter B', 'Part two', 'Chapter C'].map((t) => pageOfHeading(book, t))).toEqual([0, 1, 2, 3, 3]);
  });
});

describe('content that is hard to paginate', () => {
  it('a code block taller than a page is one page tall and scrolls inside itself: every line stays reachable', async () => {
    const book = await mountBook(`Intro.\n\n${codeBlock(120)}\n\nOutro.`);
    const pre = book.content.querySelector('pre')!;
    const code = pre.querySelector('code')!;
    expect(pagesOf(book, pre)).toHaveLength(1); // never split between pages
    expect(pre.getBoundingClientRect().height).toBeLessThanOrEqual(book.paginator.pageSize.height + 1);
    expect(code.scrollHeight).toBeGreaterThan(code.clientHeight);
    expect(code.getAttribute('tabindex')).toBe('0'); // reachable by keyboard, because it scrolls
    expect(code.getAttribute('aria-label')).toBeTruthy();

    // the first line is there, and the last one can be scrolled to
    const box = code.getBoundingClientRect();
    expect(lineRects(code)[0].top).toBeGreaterThanOrEqual(box.top - 1);
    code.scrollTop = code.scrollHeight;
    const rects = lineRects(code);
    expect(rects.length).toBeGreaterThanOrEqual(120);
    expect(rects.at(-1)!.bottom).toBeLessThanOrEqual(box.bottom + 1);
    expect(rects.at(-1)!.top).toBeGreaterThanOrEqual(box.top - 1);

    // and the text that follows is on a later page
    book.paginator.goTo(book.paginator.pageCount - 1);
    expect(visibleFragments(book, book.content.querySelector('p:last-of-type')!).length).toBeGreaterThan(0);
  });

  it('long code lines scroll sideways instead of wrapping, and the end of the line is reachable', async () => {
    const long = 'x'.repeat(400);
    const book = await mountBook('```\n' + long + '\n```');
    const pre = book.content.querySelector('pre')!;
    const code = pre.querySelector('code')!;
    expect(pre.getBoundingClientRect().width).toBeLessThanOrEqual(book.paginator.pageSize.width + 1); // the block fits its page…
    expect(code.scrollWidth).toBeGreaterThan(code.clientWidth); // …the line does not
    expect(lineRects(code)).toHaveLength(1); // one line: it is not wrapped
    expect(code.getAttribute('tabindex')).toBe('0');
    code.scrollLeft = code.scrollWidth;
    expect(lineRects(code)[0].right).toBeLessThanOrEqual(code.getBoundingClientRect().right + 1);
  });

  it('a block of code that fits has nothing to scroll and is not a tab stop', async () => {
    const book = await mountBook('Short.\n\n```c\nint x = 1;\nint y = 2;\n```');
    const code = book.content.querySelector('pre code')!;
    expect(code.scrollHeight).toBeLessThanOrEqual(code.clientHeight + 1);
    expect(code.scrollWidth).toBeLessThanOrEqual(code.clientWidth + 1);
    expect(code.hasAttribute('tabindex')).toBe(false);
  });

  it('a short code block is never split between pages', async () => {
    for (const before of range(14)) {
      const book = await mountBook(`${paragraphs(before + 1, 25)}\n\n${codeBlock(5)}\n\n${paragraphs(3, 25, 60)}`);
      const pre = book.content.querySelector('pre')!;
      expect(pagesOf(book, pre), `${before + 1} paragraphs before`).toHaveLength(1);
      cleanup();
    }
  });

  it('an image taller than a page is scaled to fit, keeping its proportions', async () => {
    const book = await mountBook(`Before.\n\n${pngImage(800, 3000)}\n\nAfter.`);
    const img = book.content.querySelector('img')!;
    await img.decode();
    await frames();
    const view = book.viewport.getBoundingClientRect();
    const box = img.getBoundingClientRect();
    expect(box.height).toBeLessThanOrEqual(view.height);
    expect(box.width).toBeLessThanOrEqual(view.width);
    expect(box.width / box.height).toBeCloseTo(800 / 3000, 1);
    expect(pagesOf(book, img)).toHaveLength(1);
  });

  it('a wide image is scaled down to the page width', async () => {
    const book = await mountBook(pngImage(3000, 200));
    const img = book.content.querySelector('img')!;
    await img.decode();
    await frames();
    expect(img.getBoundingClientRect().width).toBeLessThanOrEqual(book.viewport.getBoundingClientRect().width + 1);
  });

  it('a wide table keeps readable columns and scrolls sideways inside its block, without widening the page', async () => {
    const cells = (tag: string) => range(10).map((i) => `${tag}-supercalifragilisticexpialidocious-${i}`);
    const rows = range(8).map(() => `| ${cells('cell').join(' | ')} |`);
    const table = [`| ${cells('head').join(' | ')} |`, `|${range(10).map(() => '---').join('|')}|`, ...rows].join('\n');
    const book = await mountBook(table);
    const wrap = book.content.querySelector<HTMLElement>('.table-wrap')!;
    const pageWidth = book.content.offsetWidth;
    expect(wrap.getBoundingClientRect().width).toBeLessThanOrEqual(pageWidth + 1);
    expect(wrap.scrollWidth).toBeGreaterThan(wrap.clientWidth); // the table is wider than the page: it scrolls
    expect(wrap.dataset.scrolls === 'x' || wrap.dataset.scrolls === 'both').toBe(true);
    for (const th of wrap.querySelectorAll('th')) expect(th.getBoundingClientRect().width).toBeGreaterThanOrEqual(70); // no column is squeezed to nothing
    // and the page itself is exactly as many pages wide as it says (nothing sticks out sideways)
    const { step } = geometry(book);
    expect(book.content.scrollWidth).toBeLessThanOrEqual(step * book.paginator.pageCount);
    wrap.scrollLeft = wrap.scrollWidth; // the last column can be reached
    const last = wrap.querySelector('th:last-child')!.getBoundingClientRect();
    expect(last.right).toBeLessThanOrEqual(wrap.getBoundingClientRect().right + 1);
    expect(last.left).toBeGreaterThanOrEqual(wrap.getBoundingClientRect().left - 1);
  });

  it('a long table is one block no taller than a page, scrolls to its last row and is never split between pages', async () => {
    const rows = range(60).map((i) => `| row ${i} | value ${i} | more text for row ${i} |`);
    const book = await mountBook(['| A | B | C |', '|---|---|---|', ...rows].join('\n'));
    const wrap = book.content.querySelector<HTMLElement>('.table-wrap')!;
    expect(pagesOf(book, wrap)).toHaveLength(1);
    expect(wrap.getBoundingClientRect().height).toBeLessThanOrEqual(book.paginator.pageSize.height + 1);
    expect(wrap.scrollHeight).toBeGreaterThan(wrap.clientHeight);
    for (const tr of book.content.querySelectorAll('tr')) expect(pagesOf(book, tr)).toHaveLength(1);
    wrap.scrollTop = wrap.scrollHeight;
    const lastRow = wrap.querySelector('tbody tr:last-child')!.getBoundingClientRect();
    expect(lastRow.bottom).toBeLessThanOrEqual(wrap.getBoundingClientRect().bottom + 1);
  });

  it('a long list keeps each item whole, and a short quote stays on one page', async () => {
    for (const before of range(10)) {
      const items = range(30).map((i) => `- item ${i} with some text`).join('\n');
      const book = await mountBook(`${paragraphs(before + 1, 25)}\n\n> a short quote\n> over two lines\n\n${items}`);
      for (const li of book.content.querySelectorAll('li')) expect(pagesOf(book, li)).toHaveLength(1);
      expect(pagesOf(book, book.content.querySelector('blockquote')!), `${before + 1} paragraphs before`).toHaveLength(1);
      cleanup();
    }
  });

  it('a paragraph longer than a page flows over several pages without losing text', async () => {
    const book = await mountBook(paragraphs(1, 600));
    const p = book.content.querySelector('p')!;
    expect(pagesOf(book, p).length).toBeGreaterThan(1);
    expect(book.paginator.pageCount).toBe(pagesOf(book, p).length);
    expect(p.textContent!.split(' ').length).toBeGreaterThan(590);
  });

  it('content never disappears: every block is on some page that can be shown', async () => {
    const book = await mountBook(
      `# Title\n\n${paragraphs(4)}\n\n${codeBlock(20)}\n\n> quote\n\n${pngImage(400, 400)}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- one\n- two\n\n${paragraphs(4, 40, 20)}`,
      { chapterBreak: 'h1' },
    );
    await frames();
    for (const block of allBlocks(book.content)) {
      const pages = pagesOf(book, block);
      expect(pages.length, block.tagName).toBeGreaterThan(0);
      for (const page of pages) expect(page).toBeLessThan(book.paginator.pageCount);
    }
  });
});

describe('resizing', () => {
  const topParagraph = (book: Awaited<ReturnType<typeof mountBook>>) => {
    const view = book.viewport.getBoundingClientRect();
    for (const dy of [4, 14, 28, 44, 64]) {
      const p = document.elementFromPoint(view.left + 6, view.top + dy)?.closest('p');
      if (p && book.content.contains(p)) return p;
    }
    throw new Error('no paragraph at the top of the page');
  };

  it('recalculates the number of pages and the indicator', async () => {
    const book = await mountBook(paragraphs(40), { width: 600, height: 500 });
    const wide = book.paginator.pageCount;
    await book.resize(340, 500);
    expect(book.paginator.pageCount).toBeGreaterThan(wide);
    expect(book.bar.indicator.root.textContent).toBe(`1 / ${book.paginator.pageCount}`);
    await book.resize(600, 500);
    expect(book.paginator.pageCount).toBe(wide);
  });

  it('keeps the reader at the same place in the text', async () => {
    const book = await mountBook(paragraphs(80), { width: 520, height: 460 });
    book.paginator.goTo(Math.floor(book.paginator.pageCount / 2));
    expect(book.paginator.page).toBeGreaterThan(0);

    const sizes: [number, number][] = [[420, 460], [640, 560], [360, 420], [520, 700], [700, 360], [460, 460]];
    for (const [width, height] of sizes) {
      const reading = topParagraph(book).textContent!.slice(0, 6); // "P37 al"
      await book.resize(width, height);
      expect(book.paginator.page, `${width}x${height}`).toBeGreaterThan(0); // no jump back to the first page
      expect(topParagraph(book).textContent!.startsWith(reading) || [...book.content.querySelectorAll('p')].some((p) => p.textContent!.startsWith(reading) && visibleFragments(book, p).length > 0), `${width}x${height}: still reading "${reading}"`).toBe(true);
    }
  });

  it('keeps the position when the device is rotated', async () => {
    const book = await mountBook(paragraphs(80), { width: 400, height: 640 });
    book.paginator.goTo(Math.floor(book.paginator.pageCount / 2));
    const reading = topParagraph(book).textContent!.slice(0, 6);
    await book.resize(640, 400); // portrait → landscape
    const landscape = [...book.content.querySelectorAll('p')].find((p) => p.textContent!.startsWith(reading))!;
    expect(visibleFragments(book, landscape).length).toBeGreaterThan(0);
    const readingNow = topParagraph(book).textContent!.slice(0, 6); // (a round trip may end a page away from the start)
    await book.resize(400, 640); // and back
    const portrait = [...book.content.querySelectorAll('p')].find((p) => p.textContent!.startsWith(readingNow))!;
    expect(visibleFragments(book, portrait).length).toBeGreaterThan(0);
  });

  it('turning a page while the window is being resized does not lose the turn', async () => {
    // With animation on, the page is still sliding when the resize is processed.
    const book = await mountBook(paragraphs(60), { width: 640, height: 460, animate: true });
    expect(book.paginator.next()).toBe(true);
    book.setSize(480, 460);
    await frames(6);
    expect(book.paginator.page).toBe(1);
    const onScreen = [...book.content.querySelectorAll('p')].filter((p) => visibleFragments(book, p).length > 0);
    expect(onScreen.length).toBeGreaterThan(0);
    for (const p of onScreen) expect(pagesOf(book, p)).toContain(book.paginator.page);
  });

  it('keeps the position when CSS changes the text size together with the size (media queries, rotation)', async () => {
    const style = document.createElement('style');
    style.textContent = '.reader-stage[data-compact] .prose { font-size: 0.8rem; line-height: 1.3 }';
    document.head.append(style);
    try {
      const book = await mountBook(paragraphs(100), { width: 640, height: 460 });
      book.paginator.goTo(Math.floor(book.paginator.pageCount / 2));
      await frames(); // the position is remembered while the layout is stable
      const reading = topParagraph(book).textContent!.slice(0, 6);

      book.stage.setAttribute('data-compact', ''); // text reflows immediately…
      book.setSize(420, 460); // …together with the new size
      await frames(6);
      const same = [...book.content.querySelectorAll('p')].find((p) => p.textContent!.startsWith(reading))!;
      expect(visibleFragments(book, same).length).toBeGreaterThan(0);

      const readingNow = topParagraph(book).textContent!.slice(0, 6);
      book.stage.removeAttribute('data-compact');
      book.setSize(640, 460);
      await frames(6);
      const back = [...book.content.querySelectorAll('p')].find((p) => p.textContent!.startsWith(readingNow))!;
      expect(visibleFragments(book, back).length).toBeGreaterThan(0);
    } finally {
      style.remove();
    }
  });

  it('stays on the first page when it was on the first page', async () => {
    const book = await mountBook(paragraphs(40));
    await book.resize(380, 380);
    expect(book.paginator.page).toBe(0);
  });

  it('is clamped to the last page when the content shrinks to fewer pages', async () => {
    const book = await mountBook(paragraphs(40), { width: 340, height: 360 });
    book.paginator.goTo(book.paginator.pageCount - 1);
    await book.resize(640, 700);
    expect(book.paginator.page).toBeLessThanOrEqual(book.paginator.pageCount - 1);
    expect(visibleFragments(book, book.content.querySelectorAll('p')[book.content.querySelectorAll('p').length - 1]).length).toBeGreaterThan(0);
  });

  it('does not keep re-paginating after the size stops changing (no loops)', async () => {
    const book = await mountBook(paragraphs(60));
    book.paginator.goTo(2);
    let events = 0;
    book.paginator.onChange(() => events++);
    await book.resize(420, 400);
    const settled = { page: book.paginator.page, count: book.paginator.pageCount, events };
    await new Promise((r) => setTimeout(r, 400));
    expect({ page: book.paginator.page, count: book.paginator.pageCount, events }).toEqual(settled);
  });

  it('a burst of resizes is handled and ends consistent', async () => {
    const book = await mountBook(paragraphs(60));
    for (const w of [300, 450, 350, 600, 380]) {
      book.setSize(w, 420);
      await frames(1);
    }
    await frames(5);
    const covered = new Set([...book.content.querySelectorAll('p')].flatMap((p) => pagesOf(book, p)));
    expect([...covered].sort((a, b) => a - b)).toEqual(range(book.paginator.pageCount));
  });
});

describe('waiting for the content to be ready', () => {
  it('measures after images are loaded: the count already includes the image', async () => {
    const book = await mountBook(`${paragraphs(2)}\n\n${pngImage(400, 1200)}\n\n${paragraphs(2, 40, 10)}`);
    const before = book.paginator.pageCount;
    book.paginator.refresh();
    expect(book.paginator.pageCount).toBe(before); // a later measurement finds nothing new
    const img = book.content.querySelector('img')!;
    expect(img.complete && img.naturalWidth).toBeGreaterThan(0);
  });

  it('re-measures when an image finishes loading later', async () => {
    const book = await mountBook(paragraphs(3));
    const before = book.paginator.pageCount;
    const img = document.createElement('img');
    img.src = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="3000"><rect width="100%" height="100%"/></svg>')}`;
    img.alt = 'late';
    img.style.maxHeight = 'none';
    book.content.prepend(img);
    await img.decode();
    await frames(6);
    expect(book.paginator.pageCount).toBeGreaterThanOrEqual(before);
    const covered = new Set([...book.content.querySelectorAll('p,img')].flatMap((e) => pagesOf(book, e)));
    expect(covered.size).toBe(book.paginator.pageCount);
  });

  it('re-measures when a <details> opens', async () => {
    const book = await mountBook(`<details><summary>More</summary>${paragraphs(12)}</details>\n\n${paragraphs(2, 40, 50)}`);
    const closed = book.paginator.pageCount;
    book.content.querySelector('details')!.open = true;
    await frames(6);
    expect(book.paginator.pageCount).toBeGreaterThan(closed);
  });

  it('follows keyboard focus to the page of the focused link', async () => {
    const book = await mountBook(`${paragraphs(30)}\n\n[far away link](https://example.com/far)`);
    const link = book.content.querySelector('a')!;
    expect(book.paginator.page).toBe(0);
    link.focus();
    await frames(3);
    expect(book.paginator.page).toBe(book.paginator.pageOf(link));
    expect(book.paginator.page).toBeGreaterThan(0);
    expect(book.viewport.scrollLeft).toBe(0);
    expect(visibleFragments(book, link).length).toBeGreaterThan(0);
  });
});
