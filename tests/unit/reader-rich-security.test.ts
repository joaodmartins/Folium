// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { codeOf } from '../../src/reader/code-blocks';
import { sanitizeHtml, sanitizeMath } from '../../src/reader/sanitize';
import { render } from './reader-helpers';

const BAD_TAGS = 'script, iframe, object, embed, form, input, textarea, select, style, base, meta, link, foreignObject';
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'srcset', 'data', 'poster'];

/** Fails if anything in the DOM could run code, load active content or reach out to another site. */
function expectNothingActive(root: ParentNode, what = '') {
  expect(root.querySelectorAll(BAD_TAGS), what).toHaveLength(0);
  expect(root.querySelectorAll('img, video, audio, source, a[href]'), `${what}: no images/links appear from code or formulas`).toHaveLength(0);
  for (const element of root.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      expect(attribute.name, `${what}: <${element.tagName.toLowerCase()} ${attribute.name}>`).not.toMatch(/^on/i);
      if (URL_ATTRS.includes(attribute.name)) {
        expect(attribute.value.replace(/[\s\u0000-\u001f]+/g, ''), what).not.toMatch(/^(javascript|vbscript|data):/i);
      }
      if (attribute.name === 'style') expect(attribute.value, `${what}: style`).not.toMatch(/url\s*\(|expression|@import|javascript:/i);
    }
  }
}

describe('security: HTML inside code blocks stays text', () => {
  const payloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '</code></pre><script>alert(1)</script><pre><code>',
    '</span><script>alert(1)</script><span class="hljs-keyword">',
    '<svg onload=alert(1)><script>alert(2)</script></svg>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    '"><img src=x onerror=alert(1)>',
    '<!-- --><script>alert(1)</script>',
    '&lt;script&gt;alert(1)&lt;/script&gt;',
  ];

  for (const language of ['html', 'xml', 'javascript', 'python', 'c', 'markdown', 'json', 'bash', 'sql', 'yaml', 'css', '']) {
    it(`in a ${language || 'plain'} block: shown as text, never executed, copied exactly`, () => {
      const code = payloads.join('\n');
      const { element } = render('```' + language + '\n' + code + '\n```');
      expectNothingActive(element, language);
      expect(element.querySelector('pre > code')?.textContent).toBe(code + '\n');
      expect(codeOf(element.querySelector('pre')!)).toBe(code); // what the Copy button gives
      expect(element.querySelectorAll('pre')).toHaveLength(1); // the block did not break out
    });
  }

  it('the language name cannot break out of its attribute', () => {
    for (const info of ['"><script>alert(1)</script>', "x' onmouseover='alert(1)", 'html"onload="alert(1)', '<img src=x onerror=alert(1)>']) {
      const { element } = render('```' + info + '\ncode\n```');
      expectNothingActive(element, info);
      expect(element.querySelectorAll('pre')).toHaveLength(1);
    }
  });

  it('highlighting adds only <span class="hljs-…"> elements (and the Copy button)', () => {
    const { element } = render('```html\n<div class="a" onclick="x()">text</div>\n```');
    const tags = new Set([...element.querySelectorAll('pre *')].map((e) => e.tagName));
    expect([...tags].sort()).toEqual(['BUTTON', 'CODE', 'SPAN']);
    for (const span of element.querySelectorAll('pre span')) expect(span.className).toMatch(/^hljs-[\w-]+( hljs-[\w-]+| [\w_]+)*$/);
  });

  it('code next to malicious HTML written outside the block is still cleaned', () => {
    const { element } = render('<img src=x onerror=alert(1)>\n\n```c\nint a;\n```\n\n<script>alert(1)</script>');
    expect(element.querySelector('script')).toBeNull();
    expect(element.querySelector('img')?.hasAttribute('onerror') ?? false).toBe(false);
    expect(element.querySelectorAll('pre')).toHaveLength(1);
  });
});

describe('security: formulas', () => {
  const tex = [
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    '\\href{javascript:alert(1)}{click}',
    '\\url{javascript:alert(1)}',
    '\\includegraphics{https://evil.example/x.png}',
    '\\htmlClass{evil}{x}',
    '\\htmlId{evil}{x}',
    '\\htmlStyle{background:url(https://evil.example)}{x}',
    '\\htmlData{x=1}{y}',
    '\\textcolor{red;background:url(https://evil.example)}{x}',
    '\\color{url(javascript:1)} x',
    '\\style{background:url(//evil)}{x}',
    '\\text{<b onmouseover=alert(1)>x</b>}',
    '\\verb|<script>alert(1)</script>|',
    '\\mathrm{"><img src=x onerror=alert(1)>}',
    '\\rule{1000em}{1000em}',
    '\\Huge\\Huge\\Huge x',
  ];

  for (const source of tex) {
    it(`inline and display: ${source.slice(0, 40)}`, () => {
      const element = render(`Text $${source}$ more\n\n$$\n${source}\n$$`).element;
      expectNothingActive(element, source);
      expect(element.querySelector('p')?.textContent?.startsWith('Text ')).toBe(true); // the book carries on
    });
  }

  it('markup typed in a formula is shown as characters, not as elements', () => {
    const element = render('$<b>bold</b> < 5$').element;
    expect(element.querySelector('b')).toBeNull();
    expect(element.textContent).toContain('<');
  });

  it('commands that need trust are not obeyed: they are shown as text (KaTeX trust is off)', () => {
    const element = render('$\\htmlId{"><script>alert(1)</script>}{x}$ and $\\href{javascript:alert(1)}{click}$').element;
    expect(element.querySelector('script, a, [id]')).toBeNull();
    expect(element.querySelector('.katex-html')?.textContent).toContain('htmlId'); // the command, written out in red
    expectNothingActive(element);
  });

  it('HTML around formulas is still sanitized as before: scripts, handlers, ids and styles are removed', () => {
    const element = render(
      '<img src=x onerror=alert(1)> $x^2$ <script>alert(1)</script> <p style="position:fixed" id="clobber" onclick="alert(1)">hi</p> <a href="javascript:alert(1)">l</a>',
    ).element;
    expectNothingActive(element);
    expect(element.querySelector('.katex')).not.toBeNull();
    expect(element.querySelector('p[style], p[id="clobber"]')).toBeNull();
  });

  it('a hand-written <span class="math"> is just TeX source for KaTeX: its HTML never survives', () => {
    const element = render('<span class="math math--inline"><img src=x onerror=alert(1)>x^2</span> and <div class="math math--display"><script>alert(1)</script>y</div>').element;
    expectNothingActive(element);
    expect(element.querySelectorAll('.katex')).toHaveLength(2);
  });

  it('formulas in tables, lists and quotes are as safe', () => {
    const element = render('| a |\n|---|\n| $\\href{javascript:1}{x}$ |\n\n- $<img src=x onerror=1>$\n\n> $$\\url{javascript:1}$$').element;
    expectNothingActive(element);
  });

  it('the maths and the code do not weaken the book sanitizer: author styles, ids and handlers are still stripped', () => {
    const fragment = sanitizeHtml('<p style="color:red" id="a" onclick="x()" data-x="1">t</p><button>b</button><form></form>');
    const holder = document.createElement('div');
    holder.append(fragment);
    expect(holder.innerHTML).toBe('<p>t</p>b'); // button and form are removed (their text stays)
  });

  it('sanitizeMath (for KaTeX output only) keeps what KaTeX needs and removes everything dangerous', () => {
    const good = '<span class="katex"><span class="mord" style="margin-right:0.05em;height:0.9em;vertical-align:-0.2em">x</span><svg viewBox="0 0 10 10"><path d="M0 0L10 10"></path></svg><math><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">x</annotation></semantics></math></span>';
    const holder = document.createElement('div');
    holder.append(sanitizeMath(good));
    expect(holder.querySelector('.mord')?.getAttribute('style')).toBe('margin-right:0.05em;height:0.9em;vertical-align:-0.2em');
    expect(holder.querySelector('svg path')).not.toBeNull();
    expect(holder.querySelector('annotation')?.textContent).toBe('x');

    const bad = '<span class="katex"><script>alert(1)</script><img src=x onerror=alert(1)><svg onload=alert(1)><foreignObject><div>x</div></foreignObject></svg><a href="javascript:alert(1)" onclick="x()">y</a><span style="background:url(javascript:alert(1))" id="i">z</span><span style="width:expression(alert(1))">w</span><iframe src="//evil"></iframe><style>*{display:none}</style></span>';
    const dirty = document.createElement('div');
    dirty.append(sanitizeMath(bad));
    expect(dirty.querySelector('script, iframe, style, foreignObject')).toBeNull();
    expect(dirty.querySelector('[onerror], [onload], [onclick], [id]')).toBeNull();
    expect(dirty.querySelector('a')?.getAttribute('href') ?? '').not.toMatch(/javascript/i);
    for (const el of dirty.querySelectorAll('[style]')) expect(el.getAttribute('style')).not.toMatch(/url|expression/i);
  });
});
