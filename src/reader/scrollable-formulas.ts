// Kept apart from math.ts so the reader view can use it without loading KaTeX (which is only loaded with the book's text).

/**
 * A display formula wider than its page scrolls sideways inside its own box (the page never does).
 * Such a formula is made keyboard-focusable, so that it can be scrolled without a mouse; formulas that
 * fit are not. Depends on the page size, so the reader calls it after every layout.
 */
export function markScrollableFormulas(root: ParentNode): void {
  for (const formula of root.querySelectorAll<HTMLElement>('.katex-display')) {
    const scrolls = formula.scrollWidth > formula.clientWidth + 1;
    if (scrolls && !formula.hasAttribute('tabindex')) {
      formula.setAttribute('tabindex', '0');
      formula.setAttribute('role', 'group');
      formula.setAttribute('aria-label', 'Wide formula: scrolls sideways');
    } else if (!scrolls && formula.hasAttribute('tabindex')) {
      formula.removeAttribute('tabindex');
      formula.removeAttribute('role');
      formula.removeAttribute('aria-label');
    }
  }
}
