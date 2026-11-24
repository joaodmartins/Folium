import { expect, test, type Page } from '@playwright/test';

// Mathematics and code in the open book. Runs against tests/fixtures/e2e-library/Rich/Rich Content.md
// (see playwright.config.ts): inline and display formulas, a matrix, a sum, a very wide formula, C,
// Python, JavaScript, JSON, a 160-line listing, lines that are too long, a table with formulas,
// code in a list and a quote, and an invalid formula.

const READ = '/#/read/rich/rich-content';
const indicator = (page: Page) => page.getByTestId('page-indicator');
const next = (page: Page) => page.getByTestId('next-page');
const book = (page: Page) => page.getByTestId('book-sheet');

async function openRich(page: Page, anchor = '') {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(READ + anchor);
  await expect(book(page)).toBeVisible();
  await expect(indicator(page)).toHaveText(/^\d+(–\d+)? \/ \d+$/);
  await expect(book(page)).not.toHaveClass(/book--entering/);
  return errors;
}
const turnsDone = (page: Page) => expect(book(page)).not.toHaveAttribute('data-turning', /.*/);

/** Parts of the real book (not the copies used by page turns) that are on the visible pages. */
const onScreen = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const clip = document.querySelector('.book__clip')!.getBoundingClientRect();
    const middle = clip.left + clip.width / 2;
    const out: { text: string; full: string; side: 'left' | 'right'; box: [number, number, number, number] }[] = [];
    for (const el of document.querySelectorAll(`.book__clip .prose ${sel}`)) {
      for (const r of el.getClientRects()) {
        if (r.width === 0 || r.right <= clip.left + 1 || r.left >= clip.right - 1) continue;
        out.push({ text: (el.textContent ?? '').trim().slice(0, 16), full: (el.textContent ?? '').trim(), side: r.left + r.width / 2 < middle ? 'left' : 'right', box: [r.left, r.top, r.right, r.bottom] });
      }
    }
    return out;
  }, selector);

/** Problems on the current view: anything cut at the bottom or sticking out of its own page. */
const problemsOnView = (page: Page) =>
  page.evaluate(() => {
    const clip = document.querySelector('.book__clip')!.getBoundingClientRect();
    const column = (document.querySelector('.book__pages') as HTMLElement).offsetWidth;
    const pagesShown = document.querySelector('.book')!.getAttribute('data-pages') === '2';
    const gap = 48;
    const found = new Set<string>();
    const check = (name: string, r: DOMRect) => {
      if (r.width === 0 || r.height === 0 || r.right <= clip.left + 1 || r.left >= clip.right - 1) return;
      const x = r.left - clip.left;
      const inLeft = x + r.width <= column + 1.5;
      const inRight = pagesShown && x >= column + gap - 1.5 && x + r.width <= 2 * column + gap + 1.5;
      if (!inLeft && !inRight) found.add(`${name} not inside a page`);
      if (r.bottom > clip.bottom + 1) found.add(`${name} cut at the bottom`);
    };
    for (const el of document.querySelectorAll('.book__clip .prose p, .prose li, .prose h2, .prose h3, .prose .table-wrap, .prose blockquote, .prose .katex-display')) {
      if (el.closest('.katex-display') && !el.matches('.katex-display')) continue;
      for (const r of el.getClientRects()) check(el.tagName + '.' + String(el.className).split(' ')[0], r);
    }
    // A code block scrolls inside its own box: the box is what has to fit its page, not the lines inside it.
    for (const pre of document.querySelectorAll('.book__clip .prose pre')) for (const r of pre.getClientRects()) check('pre', r);
    return [...found];
  });

/** Every view of the book, in order. */
async function forEachView(page: Page, check: (view: number) => Promise<void>) {
  for (let view = 1; view < 80; view++) {
    await turnsDone(page);
    await check(view);
    if (await next(page).isDisabled()) return view;
    await next(page).click();
  }
  throw new Error('the book does not end');
}

test.describe('formulas', () => {
  test('are rendered, with the maths fonts, in the open book', async ({ page }) => {
    const errors = await openRich(page);
    await expect(page.locator('.book__clip .katex').first()).toBeVisible();
    expect(await page.evaluate(() => document.fonts.status === 'loaded' && document.fonts.check('1em KaTeX_Main'))).toBe(true);
    expect((await onScreen(page, 'p .katex')).length).toBeGreaterThan(0); // inline, in the first paragraph
    const katex = await page.locator('.book__clip .prose p .katex').first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, font: getComputedStyle(el).fontFamily };
    });
    expect(katex.w).toBeGreaterThan(20);
    expect(katex.font).toContain('KaTeX_Main');
    expect(errors).toEqual([]);
  });

  test('display formulas appear on the left and on the right page, centred and whole', async ({ page }) => {
    await openRich(page);
    const sides = new Set<string>();
    let formulas = 0;
    await forEachView(page, async () => {
      for (const f of await onScreen(page, '.katex-display')) {
        sides.add(f.side);
        formulas++;
      }
      expect(await problemsOnView(page)).toEqual([]);
    });
    expect([...sides].sort()).toEqual(['left', 'right']);
    expect(formulas).toBeGreaterThanOrEqual(6);
  });

  test('a formula wider than the page scrolls inside itself, reachable with the keyboard, without moving the book', async ({ page }) => {
    await openRich(page);
    const wide = page.locator('.katex-display[tabindex]').first();
    await expect(wide).toHaveCount(1);
    // go to the view with the wide formula
    await page.evaluate(() => (document.querySelector('.katex-display[tabindex]') as HTMLElement).scrollIntoView?.());
    for (let i = 0; i < 20; i++) {
      if ((await onScreen(page, '.katex-display[tabindex]')).length > 0) break;
      await next(page).click();
      await turnsDone(page);
    }
    const before = await indicator(page).textContent();
    await wide.focus();
    await expect(wide).toBeFocused();
    expect(await wide.getAttribute('aria-label')).toMatch(/scrolls sideways/);
    await page.keyboard.press('ArrowRight'); // scrolls the formula, does not turn the page
    await expect.poll(() => wide.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await expect(indicator(page)).toHaveText(before!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.book__clip').evaluate((el) => el.scrollLeft)).toBe(0);

    await page.locator('.reader-stage').click({ position: { x: 4, y: 4 } }); // focus leaves the formula
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('ArrowRight');
    await expect(indicator(page)).not.toHaveText(before!); // and the arrows turn pages again
  });

  test('an invalid formula is shown as written; the book opens and everything else is rendered', async ({ page }) => {
    const errors = await openRich(page, '#an-invalid-formula');
    await expect.poll(async () => (await onScreen(page, '.math--error')).length).toBeGreaterThan(0);
    const shown = (await onScreen(page, '.math--error')).map((x) => x.text);
    expect(shown.some((t) => t.startsWith('$\\frac{1$') || t.startsWith('$$\\unknown'))).toBe(true);
    const title = await page.locator('.book__clip .math--error').first().getAttribute('title');
    expect(title).toBeTruthy();
    await expect(page.locator('.book__clip .math--error')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('table cells with formulas keep them inside their cells', async ({ page }) => {
    await openRich(page, '#tables-with-formulas');
    await expect.poll(async () => (await onScreen(page, 'td .katex')).length).toBeGreaterThan(0);
    const inside = await page.evaluate(() =>
      [...document.querySelectorAll('.book__clip td')].every((cell) => {
        const c = cell.getBoundingClientRect();
        return [...cell.querySelectorAll('.katex')].every((k) => k.getBoundingClientRect().right <= c.right + 1);
      }),
    );
    expect(inside).toBe(true);
  });
});

test.describe('code', () => {
  test('is highlighted: keywords, strings, comments and numbers have their own colours', async ({ page }) => {
    await openRich(page, '#code');
    await expect.poll(async () => (await onScreen(page, 'pre .hljs-keyword')).length).toBeGreaterThan(0);
    const colours = await page.evaluate(() => {
      const code = document.querySelector('.book__clip pre code.language-c')!;
      const colour = (selector: string) => getComputedStyle(code.querySelector(selector)!).color;
      return { plain: getComputedStyle(code).color, keyword: colour('.hljs-keyword'), string: colour('.hljs-string'), comment: colour('.hljs-comment'), number: colour('.hljs-number') };
    });
    expect(new Set(Object.values(colours)).size).toBe(5);
  });

  test('long lines scroll sideways instead of overflowing, and a 160-line listing is one page tall and scrolls to its end', async ({ page }) => {
    await openRich(page, '#code');
    let viewsWithListing = 0;
    await forEachView(page, async () => {
      expect(await problemsOnView(page)).toEqual([]);
      if ((await onScreen(page, 'pre')).length > 0) viewsWithListing++;
    });
    expect(viewsWithListing).toBeGreaterThan(0);

    const listing = await page.evaluate(() => {
      const code = [...document.querySelectorAll<HTMLElement>('.book__clip pre > code')].find((c) => c.textContent!.includes('MARK-LONG-CODE-END'))!;
      const pre = code.parentElement!;
      const content = document.querySelector('.book__pages') as HTMLElement;
      const pages = new Set([...pre.getClientRects()].map((r) => Math.floor((r.left - content.getBoundingClientRect().left + 1) / (content.offsetWidth + 48))));
      const tall = code.scrollHeight > code.clientHeight;
      code.scrollTop = code.scrollHeight;
      const end = [...code.querySelectorAll('.hljs-comment')].find((c) => c.textContent!.includes('MARK-LONG-CODE-END'))!.getBoundingClientRect();
      const box = code.getBoundingClientRect();
      return { pages: pages.size, tall, endShown: end.bottom <= box.bottom + 1 && end.top >= box.top - 1, tab: code.getAttribute('tabindex') };
    });
    expect(listing).toEqual({ pages: 1, tall: true, endShown: true, tab: '0' });
    // blocks are not wider than their page; a line that is too long scrolls inside its block
    expect(await page.evaluate(() => [...document.querySelectorAll('.book__clip pre')].every((p) => p.getBoundingClientRect().width <= (document.querySelector('.book__pages') as HTMLElement).offsetWidth + 1))).toBe(true);
  });

  test('code in a list and in a quote is highlighted', async ({ page }) => {
    await openRich(page, '#lists-and-quotes');
    await expect.poll(async () => (await onScreen(page, 'li pre .hljs-built_in, li pre .hljs-keyword, li pre .hljs-string')).length).toBeGreaterThan(0);
    expect(await page.locator('.book__clip blockquote pre .hljs-type').count()).toBeGreaterThan(0);
  });

  test('code that looks like HTML is shown as text', async ({ page }) => {
    const errors = await openRich(page, '#other-languages');
    await expect.poll(async () => (await onScreen(page, 'pre')).length).toBeGreaterThan(0);
    expect(await page.locator('.book__clip pre script, .book__clip pre img').count()).toBe(0);
    await expect(page.locator('.book__clip pre').filter({ hasText: '<script>alert("code is only text")</script>' }).first()).toBeAttached();
    expect(errors).toEqual([]);
  });
});

test.describe('the Copy button', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  const python = (page: Page) => page.locator('.book__clip pre', { has: page.locator('code.language-python') }).filter({ hasText: 'fibonacci' }).first();

  test('copies the original code, shows "Copied", and goes back to "Copy"', async ({ page }) => {
    await openRich(page, '#code');
    await expect.poll(async () => (await onScreen(page, 'pre')).length).toBeGreaterThan(0);
    // the Python listing may be on a later page
    for (let i = 0; i < 12 && !(await python(page).evaluate((el) => { const r = el.getBoundingClientRect(); const c = document.querySelector('.book__clip')!.getBoundingClientRect(); return r.right > c.left && r.left < c.right; }).catch(() => false)); i++) {
      await next(page).click();
      await turnsDone(page);
    }
    const block = python(page);
    await block.hover();
    const button = block.locator('.code-copy');
    await expect(button).toBeVisible();
    await expect(button).toHaveText('Copy');
    await button.click();
    await expect(button).toHaveText('Copied');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe('def fibonacci(n):\n    """Return the n-th Fibonacci number."""\n    if n <= 1:\n        return n\n    return fibonacci(n - 1) + fibonacci(n - 2)\n\nprint(fibonacci(10))  # 55');
    expect(copied).not.toContain('Copy');
    expect(copied).not.toContain('<span');
    await expect(button).toHaveText('Copy', { timeout: 4000 });
  });

  test('is reachable and usable with the keyboard', async ({ page }) => {
    await openRich(page, '#code');
    const button = page.locator('.book__clip .code-copy').first();
    await button.focus();
    await expect(button).toBeVisible(); // focus shows it
    await page.keyboard.press('Enter');
    await expect(button).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('#include <stdio.h>');
  });

  test('does not appear in text that is selected and copied by hand, and takes no room on the page', async ({ page }) => {
    await openRich(page, '#code');
    const pre = page.locator('.book__clip pre').first();
    await expect(pre).toBeAttached();
    const info = await pre.evaluate((el) => {
      const button = el.querySelector('.code-copy') as HTMLElement;
      return { select: getComputedStyle(button).userSelect, position: getComputedStyle(button).position, code: el.querySelector('code')!.textContent!.includes('Copy') };
    });
    expect(info).toEqual({ select: 'none', position: 'absolute', code: false });
  });

  test('a browser without the Clipboard API fails quietly', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      document.execCommand = () => false;
    });
    const errors = await openRich(page, '#code');
    const button = page.locator('.book__clip .code-copy').first();
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveText('Copy failed');
    await expect(button).toHaveText('Copy', { timeout: 4000 });
    expect(errors).toEqual([]);
  });
});

test.describe('the Copy button on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('is always visible (there is no hover), and works', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openRich(page, '#code');
    const button = page.locator('.book__clip .code-copy').first();
    expect(Number(await button.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.5);
    await expect(button).toBeVisible();
    await button.tap();
    await expect(button).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('#include <stdio.h>');
  });
});

test.describe('in the whole book', () => {
  test('every view is clean, from the first to the last, on a desktop', async ({ page }) => {
    const errors = await openRich(page);
    let last = false;
    const views = await forEachView(page, async () => {
      expect(await problemsOnView(page)).toEqual([]);
      if ((await onScreen(page, 'p')).some((x) => x.text.includes('The end. MARK'))) last = true;
    });
    expect(views).toBeGreaterThan(5); // (the long listing now scrolls inside one page instead of covering several)
    expect(last).toBe(true);
    expect(errors).toEqual([]);
  });

  test('and on a phone (one page at a time), with nothing cut or protruding', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await openRich(page);
    await expect(book(page)).toHaveAttribute('data-pages', '1');
    let views = 0;
    await forEachView(page, async () => {
      views++;
      expect(await problemsOnView(page)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    expect(views).toBeGreaterThan(8);
    expect(errors).toEqual([]);
  });

  test('page turns over formulas and code draw them in the turning page, and finish cleanly', async ({ page }) => {
    const errors = await openRich(page, '#mathematics');
    let drawnMath = false;
    let drawnCode = false;
    for (let i = 0; i < 14 && !(await next(page).isDisabled()); i++) {
      await next(page).click();
      const copies = await page.evaluate(() => ({ math: document.querySelectorAll('.book__flip .katex').length, code: document.querySelectorAll('.book__flip pre .hljs-keyword').length, leaves: document.querySelectorAll('.flip__leaf').length }));
      expect(copies.leaves).toBeLessThanOrEqual(1);
      drawnMath ||= copies.math > 0;
      drawnCode ||= copies.code > 0;
      await turnsDone(page);
    }
    expect(drawnMath).toBe(true);
    expect(drawnCode).toBe(true);
    await expect(page.locator('.flip__leaf, .flip__still')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('clicking quickly through formulas and code ends in a clean book', async ({ page }) => {
    const errors = await openRich(page);
    const total = Number(/\/ (\d+)$/.exec((await indicator(page).textContent())!)![1]);
    await page.evaluate(async () => {
      const button = document.querySelector<HTMLButtonElement>('[data-testid="next-page"]')!;
      for (let i = 0; i < 6; i++) {
        button.click();
        await new Promise((r) => requestAnimationFrame(r));
      }
    });
    // six turns from the first view: pages 13–14 (or the last page alone, when the book ends before that)
    const left = Math.min(12, 2 * Math.floor((total - 1) / 2));
    await expect(indicator(page)).toHaveText(left + 1 < total ? new RegExp(`^${left + 1}–${left + 2} / ${total}$`) : new RegExp(`^${left + 1} / ${total}$`));
    await turnsDone(page);
    await expect(page.locator('.flip__leaf')).toHaveCount(0);
    expect(await problemsOnView(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('keeps the reading position when a tablet is rotated, with formulas and code intact', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openRich(page, '#tables-with-formulas');
    await expect.poll(async () => (await onScreen(page, 'h2')).some((h) => h.text.startsWith('Tables with'))).toBe(true);
    const labels = async () => [...new Set((await onScreen(page, 'p, h2, h3, pre, tr, .katex-display')).map((x) => x.text.slice(0, 10)))];
    await turnsDone(page);
    const before = await labels();

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(book(page)).toHaveAttribute('data-pages', '1');
    await expect.poll(async () => (await labels()).some((l) => before.includes(l))).toBe(true);
    expect(await problemsOnView(page)).toEqual([]);
    const upright = await labels();

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(book(page)).toHaveAttribute('data-pages', '2');
    await expect.poll(async () => (await labels()).some((l) => upright.includes(l))).toBe(true);
    expect(await problemsOnView(page)).toEqual([]);
  });

  test('anchors still open the right view (headings after formulas and code)', async ({ page }) => {
    await openRich(page);
    for (const id of ['mathematics', 'code', 'a-very-long-listing', 'tables-with-formulas', 'lists-and-quotes', 'other-languages', 'an-invalid-formula']) {
      await page.evaluate((hash) => (location.hash = hash), `#/read/rich/rich-content#${id}`);
      await expect.poll(async () => (await onScreen(page, 'h2, h3')).length, id).toBeGreaterThan(0);
      expect(await problemsOnView(page), id).toEqual([]);
    }
  });
});

test.describe('themes', () => {
  const theme = (page: Page, name: string) => page.getByTestId(`theme-${name}`);
  const luminance = (css: string) => {
    const [r, g, b] = css.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => ((v / 255) <= 0.03928 ? v / 255 / 12.92 : (((v / 255) + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

  test('formulas and code follow Light, Dark and Sepia, readable in each, and the pages do not change', async ({ page }) => {
    await openRich(page, '#code');
    await expect.poll(async () => (await onScreen(page, 'pre .hljs-keyword')).length).toBeGreaterThan(0);
    const state = async () => ({ total: await indicator(page).textContent(), width: await page.locator('.book__pages').evaluate((el) => el.scrollWidth) });
    const baseline = await state();
    const seen = { ink: new Set<string>(), keyword: new Set<string>() };
    for (const name of ['dark', 'sepia', 'light']) {
      await theme(page, name).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', name);
      const colours = await page.evaluate(() => {
        const pre = document.querySelector('.book__clip pre')!;
        const bg = getComputedStyle(pre).backgroundColor;
        const tokens = ['keyword', 'string', 'comment', 'number', 'title', 'type'].flatMap((t) => { const s = pre.querySelector(`.hljs-${t}`); return s ? [[t, getComputedStyle(s).color]] : []; });
        const katex = document.querySelector('.book__clip .katex');
        return { bg, tokens, katex: katex ? getComputedStyle(katex).color : null, paper: getComputedStyle(document.querySelector('.book__paper')!).backgroundColor };
      });
      for (const [token, colour] of colours.tokens) expect(contrast(colour as string, colours.bg), `${name}: ${token}`).toBeGreaterThanOrEqual(4.5);
      expect(colours.tokens.length).toBeGreaterThanOrEqual(3);
      seen.keyword.add(String(colours.tokens.find(([t]) => t === 'keyword')?.[1]));
      if (colours.katex) {
        seen.ink.add(colours.katex);
        expect(contrast(colours.katex, colours.paper), `${name}: formula`).toBeGreaterThan(7);
      }
      expect(await state(), name).toEqual(baseline);
    }
    expect(seen.keyword.size).toBe(3);
  });

  test('the chosen theme is remembered and applies to formulas on reload', async ({ page }) => {
    await openRich(page, '#mathematics');
    await theme(page, 'sepia').click();
    await page.reload();
    await expect(book(page)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
    const katex = page.locator('.book__clip .katex').first();
    await expect(katex).toBeVisible();
    const colour = await katex.evaluate((el) => getComputedStyle(el).color);
    expect(luminance(colour)).toBeLessThan(0.2); // dark ink on warm paper
  });
});
