// @vitest-environment jsdom
import hljs from 'highlight.js/lib/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { codeOf, copyText, COPY_CLASS } from '../../src/reader/code-blocks';
import { highlightCode, SUPPORTED_LANGUAGES } from '../../src/reader/highlight';
import { render } from './reader-helpers';

const fence = (lang: string, code: string) => '```' + lang + '\n' + code + '\n```';
const codeOfFirst = (markdown: string) => render(markdown).element.querySelector('pre > code')!;

/** Source in each language, and a token class that must be there. */
const SAMPLES: Record<string, { code: string; tokens: Record<string, string> }> = {
  c: {
    code: '#include <stdio.h>\n\nint main(void) {\n    int n = 42; /* answer */\n    printf("Hello\\n"); // greet\n    return 0;\n}',
    tokens: { keyword: 'return', string: '"Hello\\n"', number: '42', comment: '/* answer */', meta: '#include <stdio.h>', type: 'int' },
  },
  cpp: {
    code: '#include <vector>\n\nclass Box {\n public:\n  std::vector<int> items;\n};\n\nint main() { return 0; }',
    tokens: { keyword: 'class', title: 'Box' },
  },
  python: {
    code: 'def fibonacci(n):\n    """Return the n-th number."""\n    if n <= 1:\n        return n  # base case\n    return fibonacci(n - 1) + fibonacci(n - 2)\n\nprint("done", 55)',
    tokens: { keyword: 'def', title: 'fibonacci', string: '"done"', number: '55', comment: '# base case' },
  },
  java: {
    code: 'public class Hello {\n    public static void main(String[] args) {\n        String s = "hi"; // greet\n        int n = 7;\n    }\n}',
    tokens: { keyword: 'public', string: '"hi"', number: '7', comment: '// greet', title: 'Hello' },
  },
  javascript: {
    code: 'const x = [1, 2, 3].map((n) => n * 2);\nfunction greet(name) {\n  return `Hello ${name}`; // hi\n}',
    tokens: { keyword: 'const', number: '1', title: 'greet', string: '`Hello ${name}`', comment: '// hi' },
  },
  typescript: {
    code: 'interface User {\n  name: string;\n  age: number;\n}\nconst u: User = { name: "Ana", age: 30 };',
    tokens: { keyword: 'interface', string: '"Ana"', number: '30' },
  },
  html: {
    code: '<!DOCTYPE html>\n<html lang="en">\n  <body class="main"><p>Hi</p><!-- note --></body>\n</html>',
    tokens: { tag: '<body', attr: 'class', string: '"main"', comment: '<!-- note -->' },
  },
  css: {
    code: '.card > a:hover {\n  color: #ff8800;\n  margin: 0 12px;\n  content: "x";\n} /* end */',
    tokens: { 'selector-class': '.card', attribute: 'color', number: '#ff8800', string: '"x"', comment: '/* end */' },
  },
  json: {
    code: '{\n  "name": "Folium",\n  "pages": 20,\n  "ok": true,\n  "tags": ["a", "b"]\n}',
    tokens: { attr: '"name"', string: '"Folium"', number: '20', literal: 'true' },
  },
  bash: {
    code: '#!/bin/bash\nfor f in *.md; do\n  echo "$f" # show\ndone',
    tokens: { keyword: 'for', string: '"$f"', comment: '# show', built_in: 'echo' },
  },
  sql: {
    code: "SELECT name, COUNT(*) AS total FROM books WHERE year > 1999 AND title = 'A' -- note\nGROUP BY name;",
    tokens: { keyword: 'SELECT', number: '1999', string: "'A'", comment: '-- note' },
  },
  xml: {
    code: '<?xml version="1.0"?>\n<root id="1"><item>text</item><!-- c --></root>',
    tokens: { tag: '<root', attr: 'id', string: '"1"', comment: '<!-- c -->' },
  },
  yaml: {
    code: '# config\ntitle: Folium\npages: 20\ntags:\n  - math\n  - code\nok: true',
    tokens: { comment: '# config', attr: 'title', number: '20', literal: 'true' },
  },
  markdown: {
    code: '# Title\n\nSome **bold** and `code` and [link](http://example.com)\n\n- item\n> quote',
    tokens: { section: '# Title', strong: '**bold**', code: '`code`', link: 'http://example.com', bullet: '-' },
  },
};

describe('syntax highlighting', () => {
  for (const [language, { code, tokens }] of Object.entries(SAMPLES)) {
    it(`highlights ${language}: strings, comments, keywords, numbers and names get their own classes`, () => {
      const element = codeOfFirst(fence(language, code));
      expect(element.className).toBe(`language-${language}`);
      for (const [token, text] of Object.entries(tokens)) {
        const spans = [...element.querySelectorAll(`.hljs-${token}`)];
        expect(spans.length, `${language}: .hljs-${token}`).toBeGreaterThan(0);
        expect(spans.some((span) => span.textContent!.includes(text) || text.includes(span.textContent!)), `${language}: .hljs-${token} contains "${text}"`).toBe(true);
      }
    });

    it(`${language}: the text is exactly the code that was written`, () => {
      expect(codeOfFirst(fence(language, code)).textContent).toBe(code + '\n');
    });
  }

  it('supports the languages that were asked for, and only those (not all of highlight.js)', () => {
    expect([...SUPPORTED_LANGUAGES].sort()).toEqual(['bash', 'c', 'cpp', 'css', 'java', 'javascript', 'json', 'markdown', 'python', 'sql', 'typescript', 'xml', 'yaml']);
    expect(hljs.listLanguages().sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
    expect(hljs.getLanguage('ruby')).toBeUndefined();
  });

  it('understands the common names and aliases, in any case', () => {
    const sample = (lang: string, code: string) => codeOfFirst(fence(lang, code)).querySelectorAll('[class^="hljs-"]').length;
    for (const [lang, code] of [
      ['py', 'def f(): return 1'], ['Python', 'def f(): return 1'], ['PYTHON', 'def f(): return 1'],
      ['js', 'const a = 1;'], ['JavaScript', 'const a = 1;'], ['ts', 'const a: number = 1;'], ['c++', 'class A {};'],
      ['sh', 'echo hi # x'], ['shell', 'echo hi # x'], ['zsh', 'echo hi # x'], ['yml', 'a: 1'], ['html', '<p class="a">x</p>'],
      ['md', '# Title'],
    ] as [string, string][]) {
      expect(sample(lang, code), lang).toBeGreaterThan(0);
    }
  });

  it('takes the language from the start of the info string', () => {
    const element = codeOfFirst('```python {1,3} title="x"\ndef f(): pass\n```');
    expect(element.querySelector('.hljs-keyword')?.textContent).toBe('def');
  });

  it('an unknown language is shown as plain text, without failing', () => {
    const element = codeOfFirst(fence('klingon', "qapla' 123 <b>x</b>"));
    expect(element.className).toBe('language-klingon');
    expect(element.querySelector('[class^="hljs-"]')).toBeNull();
    expect(element.textContent).toBe("qapla' 123 <b>x</b>\n");
    expect(element.querySelector('b')).toBeNull(); // text, not markup
  });

  it('a block without a language is plain text too (nothing is guessed)', () => {
    const element = codeOfFirst('```\nint main() { return 0; }\n```');
    expect(element.className).toBe('');
    expect(element.querySelector('[class^="hljs-"]')).toBeNull();
    expect(element.textContent).toBe('int main() { return 0; }\n');
  });

  it('an indented code block is plain text', () => {
    expect(codeOfFirst('    return 1;').querySelector('[class^="hljs-"]')).toBeNull();
  });

  it('highlightCode returns "" for missing or unknown languages and never throws', () => {
    expect(highlightCode('x', '')).toBe('');
    expect(highlightCode('x', '   ')).toBe('');
    expect(highlightCode('x', 'nope')).toBe('');
    expect(highlightCode('x', '__proto__')).toBe('');
    expect(highlightCode('x', 'constructor')).toBe('');
    expect(highlightCode('def f(): pass', 'python')).toContain('hljs-keyword');
  });

  it('keeps indentation, blank lines, tabs, trailing spaces and Unicode exactly', () => {
    const code = 'def f(x):\n\tif x:   \n        return "ação ✓ Ж"\n\n\n    # last\n';
    const element = codeOfFirst(fence('python', code));
    expect(element.textContent).toBe(code + '\n');
    expect(element.textContent!.split('\n')).toEqual((code + '\n').split('\n'));
  });

  it('characters that mean something in HTML are text: < > & and quotes stay as written', () => {
    const code = 'if (a < b && c > d) { s = "<tag attr=\\"1\\">&amp;"; }';
    for (const lang of ['c', 'javascript', 'html', '']) {
      const element = codeOfFirst(fence(lang, code));
      expect(element.textContent, lang).toBe(code + '\n');
      expect(element.querySelector('tag'), lang).toBeNull();
    }
  });

  it('a very long block is highlighted completely', () => {
    const code = Array.from({ length: 400 }, (_, i) => `int v${i} = ${i}; // line ${i}`).join('\n');
    const element = codeOfFirst(fence('c', code));
    expect(element.textContent).toBe(code + '\n');
    expect(element.querySelectorAll('.hljs-number').length).toBeGreaterThanOrEqual(400);
  });

  it('code inside lists and quotes is highlighted too', () => {
    const element = render('- item\n\n  ```python\n  def f(): pass\n  ```\n\n> ```c\n> int x;\n> ```').element;
    expect(element.querySelector('li pre .hljs-keyword')?.textContent).toBe('def');
    expect(element.querySelector('blockquote pre .hljs-type')?.textContent).toBe('int');
  });
});

describe('the Copy button', () => {
  let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
  const setClipboard = (value: unknown) => Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
  const buttonOf = (element: HTMLElement, index = 0) => element.querySelectorAll<HTMLButtonElement>(`.${COPY_CLASS}`)[index];
  const click = async (button: HTMLElement) => {
    button.click();
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
    setClipboard({ writeText });
  });
  afterEach(() => {
    vi.useRealTimers();
    setClipboard(undefined);
    delete (document as { execCommand?: unknown }).execCommand;
  });

  it('every code block has one, as the last child of its <pre>, labelled for screen readers', () => {
    const { element } = render(`${fence('c', 'int a;')}\n\ntext\n\n${fence('python', 'x = 1')}\n\n    indented`);
    expect(element.querySelectorAll('pre')).toHaveLength(3);
    expect(element.querySelectorAll(`.${COPY_CLASS}`)).toHaveLength(3);
    for (const pre of element.querySelectorAll('pre')) {
      const button = pre.lastElementChild as HTMLButtonElement;
      expect(button.classList.contains(COPY_CLASS)).toBe(true);
      expect(button.type).toBe('button'); // never submits anything
      expect(button.getAttribute('aria-label')).toBe('Copy code');
      expect(button.textContent).toBe('Copy');
    }
    expect(render('no code here').element.querySelector(`.${COPY_CLASS}`)).toBeNull();
  });

  it('is not part of the code: the code text, and what the block says, exclude it', () => {
    const { element } = render(fence('c', 'int a;'));
    expect(element.querySelector('pre > code')?.textContent).toBe('int a;\n');
    expect(element.querySelector('pre > code')?.querySelector(`.${COPY_CLASS}`)).toBeNull();
    expect(codeOf(element.querySelector('pre')!)).toBe('int a;');
  });

  it('copies the original code, without the highlighting markup', async () => {
    const code = 'def f(x):\n    return "a < b" # note';
    const { element } = render(fence('python', code));
    expect(element.querySelector('pre code .hljs-keyword')).not.toBeNull(); // it is highlighted…
    await click(buttonOf(element));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(code); // …but what is copied is plain, exact text
  });

  it('copies exactly the code of its own block', async () => {
    const { element } = render(`${fence('c', 'first;')}\n\n${fence('python', 'second = 2\n\n    indented')}`);
    await click(buttonOf(element, 1));
    await click(buttonOf(element, 0));
    expect(writeText.mock.calls).toEqual([['second = 2\n\n    indented'], ['first;']]);
  });

  it('copies code that is not highlighted, and code that looks like HTML, as text', async () => {
    const code = '<script>alert(1)</script>\n<img src=x onerror=alert(1)>';
    const { element } = render(fence('', code));
    await click(buttonOf(element));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(code);
  });

  it('confirms with "Copied", then goes back to "Copy"', async () => {
    const { element } = render(fence('c', 'int a;'));
    const button = buttonOf(element);
    await click(button);
    expect(button.textContent).toBe('Copied');
    expect(button.dataset.state).toBe('done');
    await vi.advanceTimersByTimeAsync(1000);
    expect(button.textContent).toBe('Copied');
    await vi.advanceTimersByTimeAsync(1000);
    expect(button.textContent).toBe('Copy');
    expect(button.dataset.state).toBeUndefined();
  });

  it('clicking again while "Copied" restarts the confirmation', async () => {
    const { element } = render(fence('c', 'int a;'));
    const button = buttonOf(element);
    await click(button);
    await vi.advanceTimersByTimeAsync(1500);
    await click(button);
    await vi.advanceTimersByTimeAsync(500);
    expect(button.textContent).toBe('Copied'); // the first timer did not cut it short
    await vi.advanceTimersByTimeAsync(2000);
    expect(button.textContent).toBe('Copy');
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('without the Clipboard API it falls back to the old way, and without that it says so, without errors', async () => {
    setClipboard(undefined);
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;
    const { element } = render(fence('c', 'int a;'));
    const button = buttonOf(element);
    await click(button);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(button.textContent).toBe('Copied');
    expect(document.querySelector('textarea')).toBeNull(); // the helper field is gone

    await vi.advanceTimersByTimeAsync(2000);
    exec.mockReturnValue(false);
    await expect(click(button)).resolves.toBeUndefined();
    expect(button.textContent).toBe('Copy failed');
    expect(button.dataset.state).toBe('failed');

    delete (document as { execCommand?: unknown }).execCommand; // no fallback at all
    await vi.advanceTimersByTimeAsync(2000);
    await expect(click(button)).resolves.toBeUndefined();
    expect(button.textContent).toBe('Copy failed');
  });

  it('a clipboard that refuses (permissions, insecure page) is handled: nothing is thrown', async () => {
    writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const { element } = render(fence('c', 'int a;'));
    const button = buttonOf(element);
    await expect(click(button)).resolves.toBeUndefined();
    expect(button.textContent).toBe('Copy failed'); // (no execCommand in jsdom either)
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    await vi.advanceTimersByTimeAsync(2000);
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('copyText says whether it worked, and never throws', async () => {
    expect(await copyText('x')).toBe(true);
    writeText.mockRejectedValue(new Error('no'));
    expect(await copyText('x')).toBe(false);
    setClipboard({ writeText: () => { throw new Error('sync'); } });
    expect(await copyText('x')).toBe(false);
  });

  it('only the button copies: clicking the code does nothing', async () => {
    const { element } = render(fence('c', 'int a;'));
    await click(element.querySelector('pre code')!);
    await click(element.querySelector('pre')!);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('the buttons are not in the text of the book (what is selected and copied by hand, or read as the content)', () => {
    const { element } = render(`Intro\n\n${fence('c', 'int a;')}`);
    const buttonText = [...element.querySelectorAll(`.${COPY_CLASS}`)].map((b) => b.textContent);
    expect(buttonText).toEqual(['Copy']);
    expect(element.querySelector('pre > code')?.textContent).not.toContain('Copy');
  });
});
