// Kept apart from math.ts so the reader view can use it without loading KaTeX (which is only loaded with the book's text).

/** A display formula may stick out a few pixels (descenders, accents) without needing a scroll bar. */
const VERTICAL_SLACK = 6;

/**
 * A display formula wider (or taller) than its page scrolls inside its own box (the page never does).
 * Such a formula is made keyboard-focusable, so that it can be scrolled without a mouse; formulas that
 * fit are not. Depends on the page size, so the reader calls it after every layout.
 */
export function markScrollableFormulas(root: ParentNode): void {
  for (const formula of root.querySelectorAll<HTMLElement>('.katex-display')) {
    const horizontal = formula.scrollWidth > formula.clientWidth + 1;
    const vertical = formula.scrollHeight > formula.clientHeight + VERTICAL_SLACK;
    if (horizontal || vertical) {
      if (!formula.hasAttribute('tabindex')) {
        formula.setAttribute('tabindex', '0');
        formula.setAttribute('role', 'group');
      }
      formula.setAttribute('aria-label', horizontal && vertical ? 'Large formula: scrolls sideways and down' : horizontal ? 'Wide formula: scrolls sideways' : 'Tall formula: scrolls down');
      formula.toggleAttribute('data-scroll-y', vertical); // only a formula that is cut by the page gets a vertical scroll bar
    } else if (formula.hasAttribute('tabindex')) {
      formula.removeAttribute('tabindex');
      formula.removeAttribute('role');
      formula.removeAttribute('aria-label');
      formula.removeAttribute('data-scroll-y');
    }
  }
}

/**
 * A code block that is longer or wider than it can show scrolls inside itself. Like a wide formula, it is made
 * keyboard-focusable only when it really scrolls (and says so); blocks that fit are not tab stops.
 * Depends on the page size, so the reader calls it after every layout.
 */
export function markScrollableCode(root: ParentNode): void {
  for (const code of root.querySelectorAll<HTMLElement>('pre > code')) {
    const horizontal = code.scrollWidth > code.clientWidth + 1;
    const vertical = code.scrollHeight > code.clientHeight + 1;
    if (horizontal || vertical) {
      if (!code.hasAttribute('tabindex')) {
        code.setAttribute('tabindex', '0');
        code.setAttribute('role', 'group');
        code.setAttribute('aria-label', 'Code: scrolls');
      }
      code.dataset.scrolls = horizontal && vertical ? 'both' : horizontal ? 'x' : 'y';
    } else if (code.hasAttribute('tabindex')) {
      code.removeAttribute('tabindex');
      code.removeAttribute('role');
      code.removeAttribute('aria-label');
      delete code.dataset.scrolls;
    }
  }
}

/**
 * A table that is wider or taller than it can show scrolls inside its wrapper (`.table-wrap`). As with code
 * and wide formulas, it is made keyboard-focusable only when it really scrolls, and described by its size so
 * that a screen reader says what it is. Depends on the page size, so the reader calls it after every layout.
 */
export function markScrollableTables(root: ParentNode): void {
  for (const wrap of root.querySelectorAll<HTMLElement>('.table-wrap')) {
    const horizontal = wrap.scrollWidth > wrap.clientWidth + 1;
    const vertical = wrap.scrollHeight > wrap.clientHeight + 1;
    if (horizontal || vertical) {
      const table = wrap.querySelector('table');
      const rows = table?.rows.length ?? 0;
      const columns = table?.rows[0]?.cells.length ?? 0;
      const how = horizontal && vertical ? 'scrolls sideways and down' : horizontal ? 'scrolls sideways' : 'scrolls down';
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', `Table, ${rows} rows by ${columns} columns: ${how}`);
      wrap.dataset.scrolls = horizontal && vertical ? 'both' : horizontal ? 'x' : 'y';
    } else if (wrap.hasAttribute('tabindex')) {
      wrap.removeAttribute('tabindex');
      wrap.removeAttribute('role');
      wrap.removeAttribute('aria-label');
      delete wrap.dataset.scrolls;
    }
  }
}
