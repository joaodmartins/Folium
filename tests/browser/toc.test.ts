import { afterEach, describe, expect, it } from 'vitest';
import { renderTocPanel } from '../../src/components/toc-panel';
import { buildToc } from '../../src/reader/toc';
import { describePosition, headingAt, resolveRestore, type HeadingStart } from '../../src/state/progress';
import { cleanup, frames, mountBook, paragraphs, pagesOf, range, type Mounted } from './harness';

afterEach(() => {
  cleanup();
  document.body.querySelectorAll('.toc').forEach((n) => n.remove());
  document.documentElement.removeAttribute('data-theme');
});

const TEXTBOOK = [
  '# Textbook',
  ...range(6).flatMap((i) => [`## Chapter ${i + 1}`, paragraphs(5, 40, i * 10 + 1), `### Section ${i + 1}.1`, paragraphs(4, 40, i * 10 + 6)]),
].join('\n\n');

/** The page each heading starts on, measured from the real layout (what the reader does after every layout). */
function startsOf(b: Mounted): HeadingStart[] {
  return [...b.content.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')].map((h) => ({ id: h.id, startPage: b.paginator.pageOf(h) }));
}

describe('heading pages in a real layout', () => {
  it('are in reading order, and each heading is on the page where it really is', async () => {
    const b = await mountBook(TEXTBOOK, { title: 'Textbook' });
    const starts = startsOf(b);
    expect(starts.length).toBe(13);
    for (let i = 1; i < starts.length; i++) expect(starts[i].startPage, starts[i].id).toBeGreaterThanOrEqual(starts[i - 1].startPage);
    for (const h of b.content.querySelectorAll<HTMLElement>('h2, h3')) {
      expect(starts.find((s) => s.id === h.id)!.startPage).toBe(pagesOf(b, h)[0]);
    }
    expect(starts.at(-1)!.startPage).toBeGreaterThan(starts[1].startPage + 5); // the book really spans many pages
  });

  it('the heading for each page is the last one that starts on or before it (checked against the geometry)', async () => {
    const b = await mountBook(TEXTBOOK, { title: 'Textbook' });
    const starts = startsOf(b);
    for (let page = 0; page < b.paginator.pageCount; page++) {
      const expected = [...b.content.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')].filter((h) => pagesOf(b, h)[0] <= page).at(-1)?.id ?? null;
      expect(headingAt(starts, page)?.id ?? null, `page ${page + 1}`).toBe(expected);
    }
  });

  it('chapter breaks put each chapter on its own page, and the heading list follows', async () => {
    const b = await mountBook(TEXTBOOK, { title: 'Textbook', chapterBreak: 'h2' });
    const chapters = startsOf(b).filter((s) => s.id.startsWith('chapter-'));
    expect(new Set(chapters.map((c) => c.startPage)).size).toBe(6);
  });

  it('are measured again for the open book and for other sizes (they depend on the layout)', async () => {
    const b = await mountBook(TEXTBOOK, { title: 'Textbook', width: 900, height: 460 });
    const wide = startsOf(b);
    await b.resize(380, 420);
    const narrow = startsOf(b);
    expect(narrow.at(-1)!.startPage).toBeGreaterThan(wide.at(-1)!.startPage);
    expect(narrow.map((s) => s.id)).toEqual(wide.map((s) => s.id)); // the ids do not change
  });
});

describe('saved progress across layouts', () => {
  it('a position saved on a narrow screen opens in the same section on a wide one, and back', async () => {
    const b = await mountBook(TEXTBOOK, { title: 'Textbook', width: 380, height: 420 });
    for (const page of [0, 7, 19, Math.floor(b.paginator.pageCount / 2), b.paginator.pageCount - 1]) {
      b.paginator.goTo(page);
      await frames(1);
      const saved = { ...describePosition(startsOf(b), b.paginator.page, b.paginator.pageCount), savedAt: 0 };

      await b.resize(900, 520);
      const wide = startsOf(b);
      const restored = resolveRestore(saved, wide, b.paginator.pageCount);
      expect(headingAt(wide, restored)?.id ?? null, `page ${page}: same section`).toBe(saved.heading);
      b.paginator.goTo(restored);

      const back = describePosition(startsOf(b), b.paginator.page, b.paginator.pageCount);
      await b.resize(380, 420);
      const again = resolveRestore({ ...back, savedAt: 0 }, startsOf(b), b.paginator.pageCount);
      expect(headingAt(startsOf(b), again)?.id ?? null).toBe(back.heading);
    }
  });

  it('restoring puts the saved section on screen: its heading, or the text after it, is visible', async () => {
    const b = await mountBook(TEXTBOOK, { title: 'Textbook', width: 420, height: 420 });
    const target = b.content.querySelector<HTMLElement>('#chapter-4')!;
    const starts = startsOf(b);
    const restored = resolveRestore({ heading: 'chapter-4', fraction: 0, page: 0, savedAt: 0 }, starts, b.paginator.pageCount);
    b.paginator.goTo(restored);
    await frames(1);
    const box = target.getBoundingClientRect();
    const view = b.viewport.getBoundingClientRect();
    expect(box.right > view.left && box.left < view.right).toBe(true);
  });
});

describe('the table of contents panel over a real book', () => {
  const panelFor = (b: Mounted) => {
    const panel = renderTocPanel({ entries: buildToc(b.content), onSelect: () => {} });
    b.stage.parentElement!.append(panel.root);
    return panel;
  };

  it('does not change the size or position of the book or of its pages when it opens and closes', async () => {
    const b = await mountBook(TEXTBOOK, { title: 'Textbook', pages: 2, width: 900, height: 440 });
    b.paginator.goTo(4);
    await frames(2);
    const geometry = () => ({
      book: JSON.stringify(b.frame.root.getBoundingClientRect()),
      clip: JSON.stringify(b.viewport.getBoundingClientRect()),
      count: b.paginator.pageCount,
      page: b.paginator.page,
      size: b.paginator.pageSize,
    });
    const before = geometry();
    const panel = panelFor(b);
    panel.open('chapter-2');
    await frames(3);
    expect(geometry()).toEqual(before);
    panel.close();
    await frames(3);
    expect(geometry()).toEqual(before);
  });

  it('shows maths in headings as rendered formulas of real size, without TeX', async () => {
    const b = await mountBook('# Maths\n\n## The $x^2$ law\n\ntext\n\n## Proof that $\\frac{a}{b} \\leq \\sqrt{\\pi}$\n\ntext', { title: 'Maths' });
    const panel = panelFor(b);
    panel.open(null);
    const items = [...panel.root.querySelectorAll<HTMLElement>('.toc__item')];
    expect(items.length).toBe(3);
    const withMath = items.filter((i) => i.querySelector('.katex'));
    expect(withMath.length).toBe(2);
    for (const item of withMath) {
      const katex = item.querySelector('.katex')!.getBoundingClientRect();
      expect(katex.width).toBeGreaterThan(8);
      expect(katex.right).toBeLessThanOrEqual(item.getBoundingClientRect().right + 1); // inside its button
      expect(item.textContent).not.toMatch(/\\|\$|\^/);
    }
    expect(document.fonts.check('1em KaTeX_Main')).toBe(true);
  });

  it('is an overlay: below the bar, on the left, narrower than the screen, scrolling inside itself when long', async () => {
    const b = await mountBook(['# T', ...range(60).map((i) => `## Heading number ${i}`)].join('\n\n'), { title: 'T' });
    const panel = panelFor(b);
    panel.open(null);
    await frames(2);
    const dialog = panel.root.querySelector<HTMLElement>('.toc__panel')!;
    const nav = panel.root.querySelector<HTMLElement>('.toc__nav')!;
    expect(getComputedStyle(panel.root).position).toBe('absolute');
    expect(dialog.getBoundingClientRect().left).toBeLessThanOrEqual(1);
    expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual((innerWidth <= 36 * 16 ? innerWidth : 23 * 16) + 1); // 23rem, or the whole width on a narrow screen
    expect(getComputedStyle(nav).overflowY).toBe('auto');
    expect(nav.scrollHeight).toBeGreaterThan(nav.clientHeight); // long: it scrolls, the page does not
  });

  it('the active entry is visible in a long list (scrolled into view)', async () => {
    const b = await mountBook(['# T', ...range(60).map((i) => `## Heading number ${i}`)].join('\n\n'), { title: 'T' });
    const panel = panelFor(b);
    panel.open('heading-number-50');
    await frames(2);
    const nav = panel.root.querySelector<HTMLElement>('.toc__nav')!.getBoundingClientRect();
    const item = panel.root.querySelector<HTMLElement>('[aria-current]')!.getBoundingClientRect();
    expect(item.top).toBeGreaterThanOrEqual(nav.top - 1);
    expect(item.bottom).toBeLessThanOrEqual(nav.bottom + 1);
  });

  const luminance = (css: string) => {
    const [r, g, bl] = css.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => ((v / 255) <= 0.03928 ? v / 255 / 12.92 : (((v / 255) + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

  it('is readable in Light, Dark and Sepia: entries, deep entries and the active one', async () => {
    const b = await mountBook(TEXTBOOK, { title: 'Textbook' });
    const panel = panelFor(b);
    for (const theme of ['light', 'dark', 'sepia']) {
      document.documentElement.setAttribute('data-theme', theme);
      panel.open('chapter-2');
      await frames(2);
      const background = getComputedStyle(panel.root.querySelector('.toc__panel')!).backgroundColor;
      const level = (n: number) => getComputedStyle(panel.root.querySelector(`[data-level="${n}"]:not([aria-current])`)!).color;
      for (const [name, colour] of [['chapter', level(2)], ['title', level(1)], ['section', level(3)], ['active', getComputedStyle(panel.root.querySelector('[aria-current]')!).color]]) {
        expect(contrast(colour, background), `${theme}: ${name}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(getComputedStyle(panel.root.querySelector('[aria-current]')!).boxShadow).not.toBe('none'); // marked by more than colour
      panel.close();
    }
  });
});
