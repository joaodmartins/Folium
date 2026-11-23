// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { markScrollableFormulas } from '../../src/reader/math';
import { render } from './reader-helpers';

const rendered = (markdown: string) => render(markdown).element;
const annotation = (root: ParentNode) => [...root.querySelectorAll('annotation[encoding="application/x-tex"]')].map((a) => a.textContent);

describe('math: inline $…$', () => {
  it('is rendered by KaTeX inside the paragraph, without breaking the text around it', () => {
    const element = rendered('The equation $E = mc^2$ relates energy and mass.');
    const paragraph = element.querySelector('p')!;
    expect(paragraph.querySelectorAll('.katex')).toHaveLength(1);
    expect(paragraph.querySelector('.katex-display')).toBeNull(); // not a display block
    expect(paragraph.querySelector('.math--inline.math--rendered')).not.toBeNull();
    expect(paragraph.textContent?.startsWith('The equation ')).toBe(true);
    expect(paragraph.textContent?.endsWith(' relates energy and mass.')).toBe(true);
    expect(element.querySelectorAll('p')).toHaveLength(1); // it did not split the paragraph
    expect(paragraph.querySelector('.math')!.tagName).toBe('SPAN'); // stays in the line
  });

  it('keeps the TeX source in the MathML for screen readers', () => {
    expect(annotation(rendered('$E = mc^2$'))).toEqual(['E = mc^2']);
    expect(rendered('$x$').querySelector('.katex-mathml math')).not.toBeNull();
  });

  it('supports several formulas in one paragraph, next to punctuation', () => {
    const element = rendered('If $a$, $b$ and $c$ hold, then $a+b+c$.');
    expect(element.querySelectorAll('p .katex')).toHaveLength(4);
    expect(element.querySelector('p')?.textContent).toContain(', ');
  });

  it('dollar signs that are not math stay as they are (prices, a lone dollar, an escaped dollar)', () => {
    const prices = rendered('It costs $5 and then $10 more.');
    expect(prices.querySelector('.katex')).toBeNull();
    expect(prices.textContent).toContain('$5 and then $10');
    expect(rendered('A lone $ sign.').textContent).toContain('A lone $ sign.');
    const escaped = rendered('Price: \\$5 and \\$10.');
    expect(escaped.querySelector('.katex')).toBeNull();
    expect(escaped.textContent).toContain('$5 and $10');
  });

  it('is not rendered inside code', () => {
    const element = rendered('Use `$x$` in text:\n\n```\n$$\nnot math\n$$\n```');
    expect(element.querySelector('.katex')).toBeNull();
    expect(element.querySelector('p code')?.textContent).toBe('$x$');
    expect(element.querySelector('pre code')?.textContent).toContain('not math');
  });

  it('works in headings, lists, quotes and table cells', () => {
    const element = rendered('## The $n$-th term\n\n- item $x^2$\n\n> quote $\\alpha$\n\n| a | b |\n|---|---|\n| $x^2$ | $\\sqrt{y}$ |');
    expect(element.querySelector('h2 .katex')).not.toBeNull();
    expect(element.querySelector('li .katex')).not.toBeNull();
    expect(element.querySelector('blockquote .katex')).not.toBeNull();
    expect(element.querySelectorAll('td .katex')).toHaveLength(2);
  });

  it('the heading id and text come from the TeX the author wrote, not from KaTeX\'s markup', () => {
    const { headings, element } = render('## The $n$-th term\n\ntext');
    expect(headings[0]).toMatchObject({ text: 'The n-th term', id: 'the-n-th-term' });
    expect(element.querySelector('h2')?.id).toBe('the-n-th-term');
  });
});

describe('math: pipes in table cells', () => {
  it('an escaped pipe (\\|) inside a formula works, as in other Markdown viewers', () => {
    const element = rendered('| a | b |\n|---|---|\n| $\\|x\\|$ | 1 |');
    expect([...element.querySelectorAll('tbody td')].length).toBe(2);
    expect(annotation(element.querySelector('td')!)).toEqual(['|x|']);
  });

  it('a bare pipe ends the cell, even inside a formula (the table is read before the formulas): use \\| or \\vert', () => {
    const bare = rendered('| a | b |\n|---|---|\n| $|x|$ | 1 |');
    expect(bare.querySelector('.katex')).toBeNull();
    expect(rendered('| a | b |\n|---|---|\n| $\\vert x \\vert$ | 1 |').querySelectorAll('tbody td .katex')).toHaveLength(1);
  });
});

describe('math: display $$…$$', () => {
  it('is a block of its own, centred by KaTeX', () => {
    const element = rendered('Before.\n\n$$\n\\int_a^b f(x)\\,dx = F(b)-F(a)\n$$\n\nAfter.');
    const block = element.querySelector(':scope > .math--display')!;
    expect(block.tagName).toBe('DIV');
    expect(block.querySelector('.katex-display > .katex')).not.toBeNull();
    expect(annotation(block)).toEqual(['\\int_a^b f(x)\\,dx = F(b)-F(a)']);
    expect([...element.querySelectorAll(':scope > p')].map((p) => p.textContent)).toEqual(['Before.', 'After.']);
  });

  it('can be written on one line', () => {
    expect(rendered('$$x^2$$').querySelector(':scope > .math--display .katex-display')).not.toBeNull();
  });

  it('works inside lists and quotes', () => {
    const element = rendered('- item\n\n  $$\n  x^2\n  $$\n\n> $$\n> y^2\n> $$');
    expect(element.querySelector('li .katex-display')).not.toBeNull();
    expect(element.querySelector('blockquote .katex-display')).not.toBeNull();
  });

  it('several formulas in a row each get their own block', () => {
    expect(rendered('$$a$$\n\n$$b$$\n\n$$c$$').querySelectorAll(':scope > .math--display')).toHaveLength(3);
  });
});

describe('math: complex formulas', () => {
  const formulas: Record<string, string> = {
    fraction: '\\frac{a+b}{c+d}',
    integral: '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}',
    sum: '\\sum_{i=1}^{n} i^2 = \\frac{n(n+1)(2n+1)}{6}',
    limit: '\\lim_{x \\to \\infty} \\left(1 + \\frac{1}{x}\\right)^x = e',
    matrix: 'A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
    determinant: '\\det\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc',
    cases: 'f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{otherwise} \\end{cases}',
    root: '\\sqrt[3]{x^2 + y^2}',
    scripts: 'x_{i,j}^{2k}',
    greek: '\\alpha + \\beta = \\gamma \\cdot \\Omega',
    align: '\\begin{aligned} a &= b + c \\\\ &= d \\end{aligned}',
    product: '\\prod_{k=1}^{n} (1 + x_k)',
    binom: '\\binom{n}{k}',
    text: '\\text{speed} = \\frac{\\text{distance}}{\\text{time}}',
    arrows: 'A \\xrightarrow{f} B \\Rightarrow C',
  };

  for (const [name, tex] of Object.entries(formulas)) {
    it(`renders ${name}`, () => {
      const element = rendered(`$$\n${tex}\n$$`);
      expect(element.querySelector('.math--error'), tex).toBeNull();
      expect(element.querySelector('.katex-display .katex-html')?.textContent?.length ?? 0).toBeGreaterThan(0);
      expect(annotation(element)).toEqual([tex]);
    });
  }

  it('keeps the SVG that KaTeX draws for stretchy parts (big roots, arrows)', () => {
    expect(rendered('$$\\sqrt{\\frac{a}{b}} \\xrightarrow{abc} x$$').querySelector('.katex svg')).not.toBeNull();
  });

  it('keeps the inline styles KaTeX needs to lay formulas out', () => {
    const styled = rendered('$$\\frac{a}{b}$$').querySelectorAll('.katex [style]');
    expect(styled.length).toBeGreaterThan(0);
    for (const el of styled) expect(el.getAttribute('style')).toMatch(/^[a-z-]+:[^;]+;?/);
  });
});

describe('math: invalid TeX', () => {
  it('does not stop the book: the formula is shown as the source that was written, quietly marked', () => {
    const element = rendered('Before $\\frac{1$ after.\n\nA second paragraph.');
    const error = element.querySelector('.math--error')!;
    expect(error).not.toBeNull();
    expect(error.textContent).toBe('$\\frac{1$');
    expect(error.querySelector('code')?.textContent).toBe('$\\frac{1$');
    expect(error.getAttribute('title')).toBeTruthy(); // what is wrong, on hover
    expect(error.getAttribute('title')).not.toMatch(/^KaTeX parse error/);
    expect(element.querySelector('p')?.textContent).toBe('Before $\\frac{1$ after.');
    expect(element.querySelectorAll('p')).toHaveLength(2); // the rest of the book is intact
    expect(element.querySelector('.katex')).toBeNull();
  });

  it('a display formula that is invalid keeps its source too, as a block', () => {
    const element = rendered('$$\n\\unknowncommand{x}\n$$\n\nNext.');
    const error = element.querySelector(':scope > .math--display.math--error')!;
    expect(error.textContent).toBe('$$\\unknowncommand{x}$$');
    expect(element.querySelector('p')?.textContent).toBe('Next.');
  });

  it('valid formulas around an invalid one are still rendered', () => {
    const element = rendered('$a$ then $\\bad{$ then $b$');
    expect(element.querySelectorAll('.math--rendered')).toHaveLength(2);
    expect(element.querySelectorAll('.math--error')).toHaveLength(1);
  });

  it('never throws, whatever is between the dollars', () => {
    for (const tex of ['\\', '{', '}}', '\\frac', '^', '_', '\\begin{matrix}', '\\end{x}', '\\\\\\\\', '%', '\\verb|x', '#', '\\newcommand', '\\def\\a{\\a}\\a', '\\text{', '\\left(', '\\right)']) {
      expect(() => rendered(`Text $${tex}$ more\n\n$$\n${tex}\n$$`), tex).not.toThrow();
    }
  });

  it('limits what a formula may expand to (a macro bomb does not hang the book)', () => {
    const element = rendered('$$\\def\\a{\\a\\a}\\a$$\n\nStill here.');
    expect(element.querySelector('.math--error')).not.toBeNull();
    expect(element.querySelector('p')?.textContent).toBe('Still here.');
  });

  it('an empty formula is ignored', () => {
    expect(() => rendered('$$\n$$\n\nText')).not.toThrow();
  });
});

describe('math: wide formulas', () => {
  it('a formula that is wider than its box becomes keyboard-focusable; one that fits does not', () => {
    const element = rendered('$$a$$\n\n$$b$$');
    const [narrow, wide] = [...element.querySelectorAll<HTMLElement>('.katex-display')];
    // (jsdom has no layout, so the sizes are stated)
    Object.defineProperty(narrow, 'scrollWidth', { value: 100, configurable: true });
    Object.defineProperty(narrow, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(wide, 'scrollWidth', { value: 900, configurable: true });
    Object.defineProperty(wide, 'clientWidth', { value: 300, configurable: true });

    markScrollableFormulas(element);
    expect(narrow.hasAttribute('tabindex')).toBe(false);
    expect(wide.getAttribute('tabindex')).toBe('0');
    expect(wide.getAttribute('role')).toBe('group');
    expect(wide.getAttribute('aria-label')).toMatch(/scrolls sideways/);

    // after the page gets wider the formula fits, and is no longer a tab stop
    Object.defineProperty(wide, 'clientWidth', { value: 1000, configurable: true });
    markScrollableFormulas(element);
    expect(wide.hasAttribute('tabindex')).toBe(false);
    expect(wide.hasAttribute('role')).toBe(false);
  });
});
