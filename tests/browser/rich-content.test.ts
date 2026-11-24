import { afterEach, describe, expect, it, vi } from 'vitest';
import rich from '../fixtures/e2e-library/Rich/Rich Content.md?raw';
import { renderFace } from '../../src/reader/flip/faces';
import { renderMarkdown } from '../../src/reader/render';
import {
  cleanup,
  codeBlock,
  denseCode,
  fragmentsOf,
  frames,
  geometry,
  mountBook,
  pageOfRect,
  pagesOf,
  paragraphs,
  range,
  visibleFragments,
  wordsOfFace,
  wordsOfRealPage,
  type Mounted,
} from './harness';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

const book = (options: Parameters<typeof mountBook>[1] = {}) => mountBook(rich, { title: 'Rich Content', ...options });
const open = (options: Parameters<typeof mountBook>[1] = {}) => book({ pages: 2, width: 900, height: 440, ...options });

const displays = (b: Mounted) => [...b.content.querySelectorAll<HTMLElement>('.katex-display')];

/** Everything that must stay inside its page, with the page boxes it should be inside. */
function problems(b: Mounted): string[] {
  const { left, step } = geometry(b);
  const column = b.paginator.pageSize.width;
  const view = b.viewport.getBoundingClientRect();
  const found = new Set<string>();
  const check = (name: string, rect: DOMRect) => {
    if (rect.width === 0 || rect.height === 0) return;
    const page = Math.floor((rect.left - left + 1) / step);
    const columnLeft = left + page * step;
    if (rect.right > columnLeft + column + 1.5) found.add(`${name} sticks out of its page`);
    if (rect.bottom > view.bottom + 1) found.add(`${name} is cut at the bottom`);
  };
  for (const el of b.content.querySelectorAll('p, li, h1, h2, h3, tr, blockquote, .katex-display, img')) {
    if (el.closest('.katex-display') && !el.matches('.katex-display')) continue; // inside a scrolling box: clipped by it
    for (const r of fragmentsOf(el)) check(el.tagName + (el.className ? `.${String(el.className).split(' ')[0]}` : ''), r);
  }
  // A code block scrolls inside its own box, so what has to fit the page is the box (not the lines inside it).
  for (const pre of b.content.querySelectorAll('pre')) for (const r of fragmentsOf(pre)) check('pre', r);
  for (const katex of b.content.querySelectorAll('.katex')) {
    if (katex.closest('.katex-display')) continue;
    for (const r of fragmentsOf(katex)) check('inline formula', r);
  }
  return [...found];
}

describe('KaTeX in the book', () => {
  it('renders inline and display formulas, with the math fonts loaded before the pages are measured', async () => {
    const b = await book();
    expect(b.content.querySelectorAll('p .katex').length).toBeGreaterThanOrEqual(6);
    expect(displays(b).length).toBe(6);
    expect(document.fonts.status).toBe('loaded');
    expect(document.fonts.check('1em KaTeX_Main')).toBe(true);
    expect(document.fonts.check('1em KaTeX_Math')).toBe(true);
    for (const katex of b.content.querySelectorAll('.katex')) {
      const r = katex.getBoundingClientRect();
      expect(r.width, katex.textContent?.slice(0, 20)).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
    }
  });

  it('inline formulas stay in the line of text they belong to', async () => {
    const b = await book();
    const paragraphOf = [...b.content.querySelectorAll('p')].find((p) => p.textContent!.includes('E = mc'))!;
    const inline = paragraphOf.querySelector('.katex')!;
    const p = fragmentsOf(paragraphOf)[0];
    const f = inline.getBoundingClientRect();
    expect(f.left).toBeGreaterThanOrEqual(p.left - 1);
    expect(f.right).toBeLessThanOrEqual(p.right + 1);
    expect(f.top).toBeGreaterThanOrEqual(p.top - 6);
    expect(f.height).toBeLessThan(parseFloat(getComputedStyle(paragraphOf).lineHeight) * 1.8); // not a block: it does not push the lines apart
  });

  it('display formulas are centred on their page', async () => {
    const b = await book();
    let centred = 0;
    for (const formula of displays(b)) {
      if (formula.scrollWidth > formula.clientWidth + 1) continue; // wider than its box: it scrolls instead
      const katex = formula.querySelector('.katex')!.getBoundingClientRect();
      const box = formula.getBoundingClientRect(); // (inside a list item the box is the list item's)
      expect(Math.abs((katex.left + katex.right) / 2 - (box.left + box.right) / 2), formula.textContent?.slice(0, 20)).toBeLessThan(3);
      centred++;
    }
    expect(centred).toBe(5); // every display formula except the wide one
    // …and the boxes of the formulas that are not in a list or a quote are as wide as the page
    const plain = displays(b).filter((d) => !d.closest('li, blockquote'));
    for (const d of plain) expect(d.getBoundingClientRect().width).toBeCloseTo(b.paginator.pageSize.width, 0);
  });

  it('a formula wider than the page scrolls inside its own box: the page, the book and the window do not', async () => {
    const b = await book();
    const wide = displays(b).find((d) => d.scrollWidth > d.clientWidth + 1)!;
    expect(wide).toBeDefined();
    expect(wide.getBoundingClientRect().width).toBeLessThanOrEqual(b.paginator.pageSize.width + 1); // the box fits the page
    expect(getComputedStyle(wide).overflowX).toBe('auto');
    expect(wide.getAttribute('tabindex')).toBe('0'); // reachable without a mouse
    expect(wide.getAttribute('role')).toBe('group');
    wide.scrollLeft = 120;
    expect(wide.scrollLeft).toBeGreaterThan(0); // its content can be reached
    expect(b.viewport.scrollLeft).toBe(0); // …and the page window did not move
    const { step } = geometry(b);
    expect(b.content.scrollWidth).toBeLessThanOrEqual(step * b.paginator.pageCount); // nothing sticks out sideways
    expect(displays(b).filter((d) => d.hasAttribute('tabindex'))).toHaveLength(displays(b).filter((d) => d.scrollWidth > d.clientWidth + 1).length);
  });

  it('formulas that fit are not tab stops, and become one only when the page gets narrower', async () => {
    const b = await book({ width: 900, height: 440 });
    const overflowing = () => displays(b).filter((d) => d.scrollWidth > d.clientWidth + 1);
    const focusable = () => displays(b).filter((d) => d.hasAttribute('tabindex'));
    expect(overflowing().length).toBe(1);
    expect(focusable()).toEqual(overflowing());
    await b.resize(220, 440);
    expect(overflowing().length).toBeGreaterThan(1);
    expect(focusable()).toEqual(overflowing()); // exactly those that no longer fit
    await b.resize(900, 440);
    expect(focusable()).toEqual(overflowing());
    expect(focusable().length).toBe(1);
  });

  it('an invalid formula leaves the book intact: its source is shown and everything else is rendered', async () => {
    const b = await book();
    const errors = [...b.content.querySelectorAll('.math--error')];
    expect(errors.length).toBe(2);
    expect(errors.map((e) => e.textContent)).toEqual(['$\\frac{1$', '$$\\unknowncommand{x}$$']);
    for (const e of errors) expect(e.getBoundingClientRect().height).toBeGreaterThan(0); // visible
    expect(b.content.textContent).toContain('MARK-RICH-END');
    expect(wordsOfRealPage(b, b.paginator.pageCount - 1).join(' ')).toContain('MARK-RICH-END');
  });

  it('table cells with formulas keep them inside the cell, and rows are not split between pages', async () => {
    const b = await book();
    const rows = [...b.content.querySelectorAll('tbody tr')].filter((tr) => tr.querySelector('.katex'));
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(pagesOf(b, row)).toHaveLength(1);
      for (const cell of row.querySelectorAll('td')) {
        const c = cell.getBoundingClientRect();
        for (const katex of cell.querySelectorAll('.katex')) {
          expect(katex.getBoundingClientRect().right).toBeLessThanOrEqual(c.right + 1);
          expect(katex.getBoundingClientRect().left).toBeGreaterThanOrEqual(c.left - 1);
        }
      }
    }
    expect(problems(b)).toEqual([]);
  });

  it('formulas in lists and quotes are rendered where they belong', async () => {
    const b = await book();
    expect(b.content.querySelector('li .katex-display')).not.toBeNull();
    expect(b.content.querySelector('blockquote .katex')).not.toBeNull();
  });
});

describe('highlight.js in the book', () => {
  it('colours keywords, strings, comments and numbers differently, and differently from plain text', async () => {
    const b = await book();
    const python = [...b.content.querySelectorAll('pre code.language-python')].find((c) => c.textContent!.includes('fibonacci'))!;
    const colour = (selector: string) => getComputedStyle(python.querySelector(selector)!).color;
    const plain = getComputedStyle(python).color;
    const tokens = { keyword: colour('.hljs-keyword'), string: colour('.hljs-string'), comment: colour('.hljs-comment'), number: colour('.hljs-number'), name: colour('.hljs-title') };
    expect(new Set(Object.values(tokens)).size).toBe(5);
    for (const [name, value] of Object.entries(tokens)) expect(value, name).not.toBe(plain);
    expect(getComputedStyle(python.querySelector('.hljs-comment')!).fontStyle).toBe('italic');
  });

  it('highlights each of the languages in the fixture (C, Python, JavaScript, JSON, SQL, Bash, HTML)', async () => {
    const b = await book();
    for (const lang of ['c', 'python', 'javascript', 'json', 'sql', 'bash', 'html']) {
      const blocks = b.content.querySelectorAll(`pre code.language-${lang}`);
      expect(blocks.length, lang).toBeGreaterThan(0);
      expect(blocks[0].querySelector('[class^="hljs-"]'), lang).not.toBeNull();
    }
    const unknown = b.content.querySelector('pre code.language-klingon')!;
    expect(unknown.querySelector('[class^="hljs-"]')).toBeNull();
    expect(unknown.textContent).toContain("qapla' 123 <b>not highlighted</b>");
  });

  it('keeps the code exactly as written, with its indentation, on screen', async () => {
    const b = await book();
    const noLang = [...b.content.querySelectorAll('pre code')].find((c) => c.textContent!.startsWith('a block without a language'))!;
    expect(noLang.textContent).toBe('a block without a language\n    keeps its indentation\n');
    expect(getComputedStyle(noLang).whiteSpace).toBe('pre'); // lines are not wrapped: they scroll sideways when too long
    const html = [...b.content.querySelectorAll('pre code.language-html')].find((c) => c.textContent!.includes('<script>'))!;
    expect(html.querySelector('script, img')).toBeNull();
    expect(html.textContent).toContain('<script>alert("code is only text")</script>');
  });

  it('no code block is wider than its page: long lines scroll inside the block', async () => {
    const b = await book();
    for (const pre of b.content.querySelectorAll('pre')) {
      expect(pre.scrollWidth, pre.textContent!.slice(0, 20)).toBeLessThanOrEqual(pre.clientWidth + 1);
      for (const r of fragmentsOf(pre)) expect(r.width).toBeLessThanOrEqual(b.paginator.pageSize.width + 1);
    }
    expect(problems(b)).toEqual([]);
  });

  it('a very long code block stays on one page, highlighted, and scrolls to its last line', async () => {
    const b = await book();
    const pre = [...b.content.querySelectorAll('pre')].find((p) => p.textContent!.includes('MARK-LONG-CODE-END'))!;
    const code = pre.querySelector('code')!;
    expect(pagesOf(b, pre)).toHaveLength(1); // never split between pages
    expect(pre.getBoundingClientRect().height).toBeLessThanOrEqual(b.paginator.pageSize.height + 1);
    expect(code.scrollHeight).toBeGreaterThan(code.clientHeight); // longer than the page: it scrolls
    expect(pre.querySelectorAll('.hljs-number').length).toBeGreaterThan(300); // the colours are all there
    code.scrollTop = code.scrollHeight;
    const end = [...pre.querySelectorAll('.hljs-comment')].find((c) => c.textContent!.includes('MARK-LONG-CODE-END'))!;
    const box = code.getBoundingClientRect();
    const mark = end.getBoundingClientRect();
    expect(mark.bottom).toBeLessThanOrEqual(box.bottom + 1); // scrolled into view
    expect(mark.top).toBeGreaterThanOrEqual(box.top - 1);
  });

  it('a heading is never left alone at the bottom of a page before code or formulas', async () => {
    for (const rows of range(12)) {
      const b = await mountBook(`${paragraphs(rows + 1, 30)}\n\n### Heading\n\n${codeBlock(8)}\n\n#### Another\n\n$$\n\\int_a^b f(x)\\,dx\n$$\n\n${paragraphs(2, 30, 50)}`);
      for (const heading of b.content.querySelectorAll('h3, h4')) {
        expect(pagesOf(b, heading)[0], `${rows + 1} paragraphs before ${heading.tagName}`).toBe(pagesOf(b, heading.nextElementSibling!)[0]);
      }
      cleanup();
    }
  });
});

describe('the pages of a book with maths and code', () => {
  it('paginates the finished content: stable count, no later re-measuring, no cut-off or protruding parts', async () => {
    const b = await book();
    const count = b.paginator.pageCount;
    expect(count).toBeGreaterThan(8);
    let events = 0;
    b.paginator.onChange(() => events++);
    b.paginator.goTo(3);
    events = 0;
    b.paginator.refresh();
    await frames(20);
    expect(b.paginator.pageCount).toBe(count); // the first measurement was already the final one
    expect(events).toBe(0); // and nothing keeps re-measuring
    expect(problems(b)).toEqual([]);
  });

  it('a display formula is never split between pages nor cut, wherever it falls (also near the end of a page)', async () => {
    for (const before of range(14)) {
      const b = await mountBook(`${paragraphs(before + 1, 30)}\n\n$$\n\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix} = \\sum_{k=1}^{n} \\frac{1}{k^2}\n$$\n\n${paragraphs(3, 30, 50)}`);
      const formula = b.content.querySelector('.katex-display')!;
      expect(pagesOf(b, formula), `${before + 1} paragraphs before`).toHaveLength(1);
      expect(problems(b), `${before + 1} paragraphs before`).toEqual([]);
      cleanup();
    }
  });

  it('a tall formula (a big matrix) fits its page whole', async () => {
    const rows = range(9).map((i) => range(6).map((j) => `a_{${i}${j}}`).join(' & ')).join(' \\\\ ');
    const b = await mountBook(`${paragraphs(5, 30)}\n\n$$\n\\begin{bmatrix} ${rows} \\end{bmatrix}\n$$\n\n${paragraphs(2, 30, 50)}`, { height: 520 });
    const formula = b.content.querySelector('.katex-display')!;
    expect(pagesOf(b, formula)).toHaveLength(1);
    expect(problems(b)).toEqual([]);
    expect(formula.getBoundingClientRect().height).toBeGreaterThan(150);
  });

  it('formulas appear on both the left and the right page of the open book, and every page can be shown', async () => {
    const b = await open();
    const sides = new Set(displays(b).map((d) => pagesOf(b, d)[0] % 2));
    expect(sides).toEqual(new Set([0, 1]));
    for (const formula of displays(b)) {
      const page = pagesOf(b, formula)[0];
      b.paginator.goTo(page);
      expect(b.paginator.page).toBe(page - (page % 2));
      const box = visibleFragments(b, formula)[0];
      expect(box, `formula on page ${page + 1}`).toBeDefined();
      const view = b.viewport.getBoundingClientRect();
      const half = view.left + view.width / 2;
      expect(page % 2 === 0 ? box.left < half : box.right > half).toBe(true); // on the side it belongs to
      expect(box.right).toBeLessThanOrEqual(view.right + 1);
    }
  });

  it('all the views of the open book are clean: nothing cut, nothing protruding, formulas and code intact', async () => {
    const b = await open();
    const seen = new Set<string>();
    for (let guard = 0; guard < 60; guard++) {
      expect(problems(b), `view ${b.paginator.page + 1}`).toEqual([]);
      for (const text of ['MARK-LONG-CODE-END', 'MARK-RICH-END']) if ([...b.content.querySelectorAll('pre, p')].some((el) => el.textContent!.includes(text) && visibleFragments(b, el).length > 0)) seen.add(text);
      if (!b.paginator.next()) break;
    }
    expect([...seen].sort()).toEqual(['MARK-LONG-CODE-END', 'MARK-RICH-END']);
  });

  it('the Copy buttons do not take any space: without them the pages are the same', async () => {
    const b = await book();
    const before = { count: b.paginator.pageCount, pages: [...b.content.querySelectorAll('pre')].map((p) => pagesOf(b, p).join(',')) };
    for (const button of b.content.querySelectorAll('.code-copy')) button.remove();
    b.paginator.refresh();
    expect({ count: b.paginator.pageCount, pages: [...b.content.querySelectorAll('pre')].map((p) => pagesOf(b, p).join(',')) }).toEqual(before);
  });

  it('keeps the reading position through resizing and rotation, with the content still intact', async () => {
    const b = await open({ width: 900, height: 460 });
    const topLabel = () => {
      const view = b.viewport.getBoundingClientRect();
      for (const dy of [4, 14, 28, 44, 64, 90]) {
        const el = document.elementFromPoint(view.left + 6, view.top + dy)?.closest('p, pre, h2, h3, tr, .katex-display');
        if (el && b.content.contains(el)) return el.textContent!.trim().slice(0, 12);
      }
      throw new Error('nothing at the top of the page');
    };
    const visibleStart = (label: string) => [...b.content.querySelectorAll('p, pre, h2, h3, tr, .katex-display')].some((el) => el.textContent!.trim().startsWith(label) && visibleFragments(b, el).length > 0);

    b.paginator.goTo(Math.floor(b.paginator.pageCount / 2));
    await frames();
    for (const [w, h, pages] of [[420, 640, 1], [640, 420, 1], [1000, 520, 2], [700, 500, 1], [900, 460, 2]] as const) {
      const label = topLabel();
      await b.reshape(w, h, pages); // one change, like turning a tablet: the reader lays the book out once
      expect(b.paginator.page, `${w}x${h}`).toBeGreaterThan(0);
      expect(visibleStart(label), `${w}x${h}: still at "${label}"`).toBe(true);
      expect(problems(b), `${w}x${h}`).toEqual([]);
    }
  });

  it('navigating to a heading after formulas and code shows it', async () => {
    const b = await open();
    for (const heading of [...b.content.querySelectorAll('h2, h3')].reverse()) {
      b.paginator.goToElement(heading);
      expect(visibleFragments(b, heading).length, heading.textContent!).toBeGreaterThan(0);
    }
  });
});

describe('the copies drawn while a page turns', () => {
  const paper = (b: Mounted) => ({ width: b.layout.pageWidth, height: b.layout.pageHeight, textLeft: b.layout.marginX, textTop: b.layout.marginY });

  /** Where the formulas and code blocks are on a page, measured from the corner of the page's text. */
  const realBlocks = (b: Mounted, page: number) => {
    const { left, step } = geometry(b);
    const top = b.content.getBoundingClientRect().top;
    const out: string[] = [];
    for (const el of b.content.querySelectorAll('.katex-display, pre')) {
      for (const r of fragmentsOf(el)) if (pageOfRect(b, r) === page) out.push(`${el.className.split(' ')[0] || el.tagName}:${Math.round(r.left - (left + page * step))}:${Math.round(r.top - top)}:${Math.round(r.height)}`);
    }
    return out.sort();
  };
  const faceBlocks = (face: Element) => {
    const window = face.querySelector('.flip__window')!.getBoundingClientRect();
    const out: string[] = [];
    for (const el of face.querySelectorAll('.katex-display, pre')) {
      for (const r of fragmentsOf(el)) if (r.left >= window.left - 1 && r.left < window.right - 1) out.push(`${el.className.split(' ')[0] || el.tagName}:${Math.round(r.left - window.left)}:${Math.round(r.top - window.top)}:${Math.round(r.height)}`);
    }
    return out.sort();
  };

  it('show the same text and put every formula and code block exactly where the real page has it', async () => {
    const b = await open();
    const size = b.paginator.pageSize;
    const mismatches: string[] = [];
    for (let page = 0; page < b.paginator.pageCount; page++) {
      const face = renderFace(b.content, page, size, paper(b), 'flip__face--still');
      if (!face) {
        mismatches.push(`page ${page + 1} cannot be copied`);
        continue;
      }
      b.frame.flipLayer.replaceChildren(face);
      await frames(1);
      if (wordsOfFace(face).join(' ') !== wordsOfRealPage(b, page).join(' ')) mismatches.push(`page ${page + 1}: text differs`);
      const real = realBlocks(b, page);
      const copy = faceBlocks(face);
      if (real.join('|') !== copy.join('|')) mismatches.push(`page ${page + 1}: blocks ${real.join(',')} vs ${copy.join(',')}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('use the same maths fonts and code colours as the real page, in every theme', async () => {
    const b = await open();
    const page = pagesOf(b, displays(b)[0])[0];
    const face = renderFace(b.content, page, b.paginator.pageSize, paper(b), 'x')!;
    b.frame.flipLayer.replaceChildren(face);
    for (const theme of ['light', 'dark', 'sepia']) {
      document.documentElement.setAttribute('data-theme', theme);
      await frames(1);
      const real = displays(b)[0].querySelector('.katex')!;
      const copy = face.querySelector('.katex')!;
      expect(getComputedStyle(copy).fontFamily).toBe(getComputedStyle(real).fontFamily);
      expect(getComputedStyle(copy).color).toBe(getComputedStyle(real).color);
      expect(copy.getBoundingClientRect().width).toBeCloseTo(real.getBoundingClientRect().width, 0);
    }
    const codePage = pagesOf(b, b.content.querySelector('pre code.language-python')!.parentElement!)[0];
    const codeFace = renderFace(b.content, codePage, b.paginator.pageSize, paper(b), 'x')!;
    b.frame.flipLayer.replaceChildren(codeFace);
    await frames(1);
    const colour = (root: Element) => getComputedStyle(root.querySelector('.language-python .hljs-keyword')!).color;
    expect(colour(codeFace)).toBe(colour(b.content));
  });

  it('a page turn over pages with formulas and code draws them in the turning leaf', async () => {
    const b = await open({ turnDuration: 60 });
    let withMath = -1;
    for (let view = 0; view + 2 < b.paginator.pageCount; view += 2) {
      b.paginator.goTo(view);
      await frames(1);
      const pagesShown = [view, view + 1, view + 2];
      if (displays(b).some((d) => pagesShown.includes(pagesOf(b, d)[0]))) {
        withMath = view;
        break;
      }
    }
    expect(withMath).toBeGreaterThanOrEqual(0);
    expect(b.turner.turn(1)).toBe(true);
    const layer = b.frame.flipLayer;
    expect(layer.querySelectorAll('.flip__leaf').length).toBe(1);
    expect(layer.querySelectorAll('.katex').length).toBeGreaterThan(0);
    for (const copy of layer.querySelectorAll('.flip__copy')) {
      expect(copy.hasAttribute('inert')).toBe(true);
      expect(copy.querySelector('[id]')).toBeNull();
    }
    await vi.waitFor(() => expect(b.turner.busy).toBe(false), { timeout: 3000 });
    expect(layer.childElementCount).toBe(0);
  });

  it('a page whose code block is too big to copy is turned with a plain fade, and nothing breaks', async () => {
    const b = await mountBook(`${paragraphs(30)}\n\n${denseCode(400)}\n\n${paragraphs(30, 40, 40)}`, { pages: 2, width: 700, height: 260, turnDuration: 60 });
    const pre = b.content.querySelector('pre')!;
    const start = pagesOf(b, pre)[0];
    b.paginator.goTo(Math.max(0, start - 2));
    await frames(1);
    const before = b.paginator.page;
    expect(b.turner.turn(1)).toBe(true);
    expect(b.paginator.page).toBe(before + 2);
    await vi.waitFor(() => expect(b.turner.busy).toBe(false), { timeout: 3000 });
    expect(problems(b)).toEqual([]);
  });
});

describe('themes', () => {
  const luminance = (css: string) => {
    const [r, g, bl] = css.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => ((v / 255) <= 0.03928 ? v / 255 / 12.92 : (((v / 255) + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

  it('Light, Dark and Sepia change the colours of formulas and code, never the pages', async () => {
    const b = await open();
    b.paginator.goTo(4);
    const snapshot = () => ({
      count: b.paginator.pageCount,
      page: b.paginator.page,
      width: b.content.scrollWidth,
      formulas: displays(b).map((d) => pagesOf(b, d).join(',')),
      code: [...b.content.querySelectorAll('pre')].map((p) => pagesOf(b, p).join(',')),
    });
    document.documentElement.setAttribute('data-theme', 'light');
    const light = snapshot();
    const inks = new Set<string>();
    const keywords = new Set<string>();
    for (const theme of ['dark', 'sepia', 'light']) {
      document.documentElement.setAttribute('data-theme', theme);
      await frames(2);
      expect(snapshot(), theme).toEqual(light);
      inks.add(getComputedStyle(displays(b)[0].querySelector('.katex')!).color);
      keywords.add(getComputedStyle(b.content.querySelector('.hljs-keyword')!).color);
    }
    expect(inks.size).toBe(3); // the formulas follow the page ink of each theme
    expect(keywords.size).toBe(3);
  });

  it('formulas use the colour of the text around them in every theme', async () => {
    const b = await book();
    for (const theme of ['light', 'dark', 'sepia']) {
      document.documentElement.setAttribute('data-theme', theme);
      await frames(2);
      const text = getComputedStyle(b.content.querySelector('p')!).color;
      expect(getComputedStyle(displays(b)[0].querySelector('.katex')!).color, theme).toBe(text);
      expect(contrast(getComputedStyle(b.frame.root.querySelector('.book__paper')!).backgroundColor, text), theme).toBeGreaterThan(7);
    }
  });

  it('every kind of code token is readable (WCAG AA, 4.5:1) on the code block in every theme', async () => {
    const b = await book();
    const pre = b.content.querySelector('pre')!;
    const tokenClasses = ['keyword', 'string', 'comment', 'number', 'title', 'type', 'attr', 'meta', 'built_in', 'variable', 'literal', 'tag', 'name', 'section', 'attribute', 'selector-class'];
    for (const theme of ['light', 'dark', 'sepia']) {
      document.documentElement.setAttribute('data-theme', theme);
      await frames(2);
      const background = getComputedStyle(pre).backgroundColor;
      const tested = new Set<string>();
      for (const cls of tokenClasses) {
        const span = b.content.querySelector(`pre .hljs-${cls}`);
        if (!span) continue;
        tested.add(cls);
        expect(contrast(getComputedStyle(span).color, background), `${theme}: .hljs-${cls}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(tested.size).toBeGreaterThanOrEqual(7);
      expect(contrast(getComputedStyle(pre.querySelector('code')!).color, background), `${theme}: plain code`).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('security in a real browser', () => {
  it('malicious code blocks and formulas run nothing and add no active content', async () => {
    const w = window as unknown as { __pwned?: boolean };
    w.__pwned = undefined;
    const payload = [
      '```html\n<img src=x onerror="window.__pwned=true"><script>window.__pwned=true</script>\n```',
      '```javascript\n</code></pre><img src=x onerror="window.__pwned=true">\n```',
      '$<img src=x onerror="window.__pwned=true">$ and $\\href{javascript:window.__pwned=true}{x}$',
      '$$\\url{javascript:window.__pwned=true}$$',
      '$$\\htmlStyle{background:url(https://evil.example/x)}{y}$$',
      '<img src=x onerror="window.__pwned=true"> $x^2$ <svg onload="window.__pwned=true"></svg>',
      '<span class="math"><img src=x onerror="window.__pwned=true"></span>',
    ].join('\n\n');
    const { element } = renderMarkdown(payload, { title: 'x', bookId: 'x', bookPath: 'x.md', findBookByPath: () => undefined, assetUrl: () => undefined });
    document.body.append(element);
    await frames(8); // time for an onerror handler to fire, if there were one
    expect(w.__pwned).toBeUndefined();
    expect(element.querySelectorAll('script, iframe, img, [onerror], [onload], a[href]')).toHaveLength(0);
    expect(element.querySelectorAll('[style*="url("]')).toHaveLength(0);
    expect(element.querySelectorAll('.katex').length).toBeGreaterThan(0);
    element.remove();
  });
});
