import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanup,
  codeBlock,
  fragmentsOf,
  frames,
  geometry,
  mountBook,
  pagesOf,
  paragraphs,
  pageOfRect,
  pngImage,
  range,
  visibleFragments,
  type Mounted,
} from './harness';

afterEach(cleanup);

const open = (markdown: string, options: Parameters<typeof mountBook>[1] = {}) =>
  mountBook(markdown, { pages: 2, width: 900, height: 440, ...options });

/** Pages that have something on screen right now, for a set of elements. */
const pagesOnScreen = (book: Mounted, selector = 'p, li, h1, h2, h3, pre, td, th') =>
  [
    ...new Set(
      [...book.content.querySelectorAll(selector)].flatMap((el) =>
        visibleFragments(book, el).map((r) => pageOfRect(book, r)),
      ),
    ),
  ].sort((a, b) => a - b);

/** Five short pages (one per paragraph) separated by manual breaks: an odd number of pages. */
const FIVE = ['A', 'B', 'C', 'D', 'E'].map((n) => `Page ${n} text.`).join('\n\n<!-- pagebreak -->\n\n');

describe('open book: two pages side by side', () => {
  it('shows two pages at once: the page and the one after it', async () => {
    const book = await open(paragraphs(60));
    expect(book.paginator.pagesPerView).toBe(2);
    expect(book.paginator.page).toBe(0);
    expect(book.paginator.pageCount).toBeGreaterThan(4);
    expect(pagesOnScreen(book)).toEqual([0, 1]);
  });

  it('the pages are side by side, with the gutter between them', async () => {
    const book = await open(paragraphs(60));
    const left = [...book.content.querySelectorAll('p')].find((p) => pagesOf(book, p).includes(0))!;
    const right = [...book.content.querySelectorAll('p')].find((p) => pagesOf(book, p)[0] === 1)!;
    const l = visibleFragments(book, left)[0];
    const r = visibleFragments(book, right)[0];
    expect(r.left).toBeGreaterThan(l.right); // right page is to the right of the left page
    expect(r.left - l.left).toBeCloseTo(book.paginator.pageSize.width + book.paginator.pageSize.gap, 0);
    const clip = book.viewport.getBoundingClientRect();
    expect(clip.width).toBeCloseTo(2 * book.paginator.pageSize.width + book.paginator.pageSize.gap, 0);
  });

  it('turns two pages at a time, with the numbering of individual pages', async () => {
    const book = await open(paragraphs(60));
    const { paginator, bar } = book;
    expect(bar.indicator.root.textContent).toBe(`1–2 / ${paginator.pageCount}`);
    expect(paginator.next()).toBe(true);
    expect(paginator.page).toBe(2);
    expect(bar.indicator.root.textContent).toBe(`3–4 / ${paginator.pageCount}`);
    expect(pagesOnScreen(book)).toEqual([2, 3]);
    expect(paginator.next()).toBe(true);
    expect(paginator.page).toBe(4);
    expect(paginator.prev()).toBe(true);
    expect(paginator.prev()).toBe(true);
    expect(paginator.page).toBe(0);
    expect(paginator.prev()).toBe(false);
    expect(book.bar.prevButton.disabled).toBe(true);
  });

  it('with an even number of pages, the last view shows the last two', async () => {
    const book = await open(['A', 'B', 'C', 'D'].map((n) => `Page ${n}.`).join('\n\n<!-- pagebreak -->\n\n'));
    expect(book.paginator.pageCount).toBe(4);
    book.paginator.goTo(3);
    expect(book.paginator.page).toBe(2);
    expect(pagesOnScreen(book)).toEqual([2, 3]);
    expect(book.paginator.next()).toBe(false);
    expect(book.bar.indicator.root.textContent).toBe('3–4 / 4');
    expect(book.bar.nextButton.disabled).toBe(true);
  });

  it('with an odd number of pages, the last view shows the last page alone and invents nothing', async () => {
    const book = await open(FIVE);
    expect(book.paginator.pageCount).toBe(5);
    expect(book.bar.indicator.root.textContent).toBe('1–2 / 5');

    book.paginator.goTo(4);
    expect(book.paginator.page).toBe(4);
    expect(pagesOnScreen(book)).toEqual([4]); // only page 5 has text; the right-hand page is empty paper
    expect(book.bar.indicator.root.textContent).toBe('5 / 5');
    expect(book.paginator.next()).toBe(false);
    expect(book.bar.nextButton.disabled).toBe(true);

    const text = [...book.content.querySelectorAll('p')].filter((p) => visibleFragments(book, p).length > 0).map((p) => p.textContent);
    expect(text).toEqual(['Page E text.']);

    expect(book.paginator.prev()).toBe(true); // back to pages 3 and 4
    expect(book.paginator.page).toBe(2);
    expect(book.bar.indicator.root.textContent).toBe('3–4 / 5');
  });

  it('the first view is pages 1 and 2: the first page is not preceded by a blank one', async () => {
    const book = await open(FIVE);
    const [first, second] = [...book.content.querySelectorAll('p')];
    expect(pagesOf(book, first)).toEqual([0]);
    expect(pagesOf(book, second)).toEqual([1]);
    expect(visibleFragments(book, first).length).toBeGreaterThan(0);
    expect(visibleFragments(book, second).length).toBeGreaterThan(0);
    expect(visibleFragments(book, first)[0].left).toBeLessThan(visibleFragments(book, second)[0].left);
  });

  it('going to a page shows the view that contains it, whichever side it is on', async () => {
    const book = await open(paragraphs(80));
    const last = book.paginator.pageCount - 1;
    for (const target of [0, 1, 2, 3, 6, 7, 10, 11, last]) {
      book.paginator.goTo(target);
      expect(book.paginator.page, `goTo(${target})`).toBe(target - (target % 2));
      expect(pagesOnScreen(book), `goTo(${target})`).toContain(target);
    }
    book.paginator.goTo(9999);
    expect(book.paginator.page).toBe(last - (last % 2));
    book.paginator.goTo(-3);
    expect(book.paginator.page).toBe(0);
  });

  it('a heading on the right-hand page opens the view that holds it', async () => {
    const book = await open(range(8).map((i) => `## Section ${i + 1}\n\n${paragraphs(4, 40, i * 4 + 1)}`).join('\n\n'));
    for (const heading of [...book.content.querySelectorAll('h2')].reverse()) {
      book.paginator.goToElement(heading);
      const own = book.paginator.pageOf(heading);
      expect(book.paginator.page).toBe(own - (own % 2));
      expect(visibleFragments(book, heading).length).toBeGreaterThan(0);
    }
  });

  it('manual page breaks and chapter breaks count as pages of the open book', async () => {
    const manual = await open('A\n\n<!-- pagebreak -->\n\nB\n\n<!-- pagebreak -->\n\nC');
    expect(manual.paginator.pageCount).toBe(3);
    expect(pagesOnScreen(manual)).toEqual([0, 1]);
    expect(manual.bar.indicator.root.textContent).toBe('1–2 / 3');

    const chapters = await open('# One\n\ntext\n\n# Two\n\ntext\n\n# Three\n\ntext\n\n# Four\n\ntext', { chapterBreak: 'h1' });
    expect(chapters.paginator.pageCount).toBe(4);
    const h = [...chapters.content.querySelectorAll('h1')].map((el) => pagesOf(chapters, el)[0]);
    expect(h).toEqual([0, 1, 2, 3]); // each chapter on its own page, left or right
  });

  it('a different page count per page size: pages are as wide as one column', async () => {
    const open2 = await open(paragraphs(60), { width: 900, height: 440 });
    const single = await mountBook(paragraphs(60), { pages: 1, width: 450, height: 440 });
    // two columns of about 400px (open book) vs one of about 410px (single page): similar number of pages
    expect(Math.abs(open2.paginator.pageCount - single.paginator.pageCount)).toBeLessThan(open2.paginator.pageCount * 0.2);
  });

  it('keeps every part of the content inside its page (code, images, tables, quotes)', async () => {
    const book = await open(
      `${paragraphs(3)}\n\n${codeBlock(70)}\n\n${pngImage(300, 1200)}\n\n> a quote\n\n| a | b |\n|---|---|\n${range(40).map((i) => `| row ${i} | value ${i} |`).join('\n')}\n\n${paragraphs(3, 40, 20)}`,
    );
    await frames();
    const { left, step } = geometry(book);
    const columnWidth = book.paginator.pageSize.width;
    const view = book.viewport.getBoundingClientRect();
    for (const el of book.content.querySelectorAll('p, pre, img, .table-wrap, blockquote, li')) {
      const boxes = fragmentsOf(el); // code and tables scroll inside their own box: the box is what has to fit
      for (const r of boxes) {
        if (r.width === 0) continue;
        const column = Math.floor((r.left - left + 1) / step);
        const columnLeft = left + column * step;
        expect(r.right, `${el.tagName} sticks out of its page`).toBeLessThanOrEqual(columnLeft + columnWidth + 1);
        expect(r.bottom, `${el.tagName} is cut at the bottom`).toBeLessThanOrEqual(view.bottom + 1);
      }
    }
  });

  it('every page of an open book has something on it, and the last text is on the last page', async () => {
    const book = await open(paragraphs(60));
    const pages = new Set([...book.content.querySelectorAll('p')].flatMap((p) => pagesOf(book, p)));
    expect([...pages].sort((a, b) => a - b)).toEqual(range(book.paginator.pageCount));
  });
});

describe('open book: size changes', () => {
  const topLabel = (book: Mounted) => {
    const view = book.viewport.getBoundingClientRect();
    for (const dy of [4, 14, 28, 44, 64]) {
      const p = document.elementFromPoint(view.left + 6, view.top + dy)?.closest('p');
      if (p && book.content.contains(p)) return p.textContent!.slice(0, 6);
    }
    throw new Error('no paragraph at the top-left of the open book');
  };
  const visible = (book: Mounted, label: string) => {
    const p = [...book.content.querySelectorAll('p')].find((el) => el.textContent!.startsWith(label))!;
    return visibleFragments(book, p).length > 0;
  };

  it('closing the book to one page (and opening it again) keeps the reader at the same place', async () => {
    const book = await open(paragraphs(120));
    book.paginator.goTo(Math.floor(book.paginator.pageCount / 2));
    await frames();
    const reading = topLabel(book);

    await book.setPages(1);
    expect(book.paginator.pagesPerView).toBe(1);
    expect(book.paginator.page).toBeGreaterThan(0);
    expect(visible(book, reading)).toBe(true);
    expect(book.bar.indicator.root.textContent).toMatch(/^\d+ \/ \d+$/); // one number again

    const single = topLabel(book);
    await book.setPages(2);
    expect(book.paginator.pagesPerView).toBe(2);
    expect(book.paginator.page % 2).toBe(0);
    expect(visible(book, single)).toBe(true);
    expect(book.bar.indicator.root.textContent).toMatch(/^\d+–\d+ \/ \d+$/);
  });

  it('resizing the open book keeps the position and the layout stays two pages', async () => {
    const book = await open(paragraphs(120), { width: 900, height: 460 });
    book.paginator.goTo(Math.floor(book.paginator.pageCount / 2));
    await frames();
    for (const [w, h] of [[760, 460], [1100, 520], [820, 400], [900, 460]] as const) {
      const reading = topLabel(book);
      await book.resize(w, h);
      expect(book.paginator.page, `${w}x${h}`).toBeGreaterThan(0);
      expect(book.paginator.page % 2).toBe(0);
      expect(visible(book, reading), `${w}x${h}: still reading ${reading}`).toBe(true);
    }
  });

  it('the page count follows the size: bigger pages, fewer of them', async () => {
    const book = await open(paragraphs(100), { width: 760, height: 400 });
    const small = book.paginator.pageCount;
    await book.resize(1200, 700);
    expect(book.paginator.pageCount).toBeLessThan(small);
    await book.resize(760, 400);
    expect(book.paginator.pageCount).toBe(small);
  });

  it('the last view stays valid when the book gets shorter than the page the reader was on', async () => {
    const book = await open(paragraphs(100), { width: 760, height: 400 });
    book.paginator.goTo(book.paginator.pageCount - 1);
    await book.resize(1200, 700);
    expect(book.paginator.page).toBeLessThanOrEqual(book.paginator.pageCount - 1);
    expect(book.paginator.page % 2).toBe(0);
    expect(pagesOnScreen(book).length).toBeGreaterThan(0);
  });
});

describe('themes do not change the pages', () => {
  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  it('light, dark and sepia change the colours and nothing about the layout', async () => {
    const book = await open(`# Title\n\n${paragraphs(30)}\n\n${codeBlock(12)}\n\n${paragraphs(10, 40, 40)}`, { chapterBreak: 'h1' });
    book.paginator.goTo(2);
    const snapshot = () => ({
      count: book.paginator.pageCount,
      page: book.paginator.page,
      width: book.content.scrollWidth,
      pages: [...book.content.querySelectorAll('p, pre')].map((el) => pagesOf(book, el).join(',')),
    });
    const colours = () => ({
      paper: getComputedStyle(book.frame.root).backgroundColor,
      ink: getComputedStyle(book.content.querySelector('p')!).color,
      desk: getComputedStyle(book.stage).backgroundColor,
    });

    document.documentElement.setAttribute('data-theme', 'light');
    const light = snapshot();
    const lightColours = colours();
    const seen = new Set([JSON.stringify(lightColours)]);

    for (const theme of ['dark', 'sepia', 'light']) {
      document.documentElement.setAttribute('data-theme', theme);
      await frames(3);
      expect(snapshot(), `theme ${theme}`).toEqual(light);
      seen.add(JSON.stringify(colours()));
    }
    expect(seen.size).toBe(3); // three different looks
  });

  it('each theme keeps the text readable: strong contrast between page and ink', async () => {
    const book = await open(paragraphs(6));
    const luminance = (css: string) => {
      const [r, g, b] = css.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const theme of ['light', 'dark', 'sepia']) {
      document.documentElement.setAttribute('data-theme', theme);
      await frames(2);
      const paper = luminance(getComputedStyle(book.frame.root.querySelector('.book__paper')!).backgroundColor);
      const ink = luminance(getComputedStyle(book.content.querySelector('p')!).color);
      const ratio = (Math.max(paper, ink) + 0.05) / (Math.min(paper, ink) + 0.05);
      expect(ratio, `contrast in ${theme}`).toBeGreaterThan(7); // WCAG AAA for body text
    }
  });
});
