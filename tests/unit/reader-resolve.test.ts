// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { folderOf, isExternal, isRootAbsolute, resolveLibraryPath, splitHref } from '../../src/reader/paths';
import { findAnchorTarget, scrollToAnchor } from '../../src/reader/anchors';
import { render } from './reader-helpers';

describe('path resolution', () => {
  it('resolves paths relative to the folder of the book', () => {
    expect(resolveLibraryPath('Languages/Russian/A1', 'images/diagram.png')).toBe('Languages/Russian/A1/images/diagram.png');
    expect(resolveLibraryPath('Languages/Russian/A1', './images/diagram.png')).toBe('Languages/Russian/A1/images/diagram.png');
    expect(resolveLibraryPath('Languages/Russian/A1', '../covers/book.png')).toBe('Languages/Russian/covers/book.png');
    expect(resolveLibraryPath('Languages/Russian/A1', '../../../x.png')).toBe('x.png'); // the Library root
    expect(resolveLibraryPath('Languages/Russian/A1', '../../../../x.png')).toBeNull(); // leaves Library/
    expect(resolveLibraryPath('', 'cover.png')).toBe('cover.png');
    expect(resolveLibraryPath('', '../cover.png')).toBeNull();
  });

  it('decodes %-escapes (spaces in file names) and tolerates malformed ones', () => {
    expect(resolveLibraryPath('A', 'my%20image.png')).toBe('A/my image.png');
    expect(resolveLibraryPath('A', '%E0%A4%A.png')).toBe('A/%E0%A4%A.png');
  });

  it('knows the folder of a path', () => {
    expect(folderOf('Languages/Russian/A1/Alphabet.md')).toBe('Languages/Russian/A1');
    expect(folderOf('Top.md')).toBe('');
  });

  it('splits links into path and decoded anchor', () => {
    expect(splitHref('Lesson%201.md#The%20part')).toEqual({ path: 'Lesson%201.md', anchor: 'The part' });
    expect(splitHref('a.md')).toEqual({ path: 'a.md', anchor: '' });
    expect(splitHref('a.md?x=1#b')).toEqual({ path: 'a.md', anchor: 'b' });
  });

  it('tells external, root-absolute and relative URLs apart', () => {
    for (const url of ['https://a.b', 'http://a.b', 'mailto:a@b.c', 'tel:1', '//cdn.example/x.png', 'data:image/png;base64,AA'])
      expect(isExternal(url), url).toBe(true);
    for (const url of ['images/a.png', './a.png', '../a.png', '#top', '/x.png']) expect(isExternal(url), url).toBe(false);
    expect(isRootAbsolute('/x.png')).toBe(true);
    expect(isRootAbsolute('//cdn.example/x.png')).toBe(false);
  });
});

describe('images', () => {
  const src = (md: string) => render(md).element.querySelector('img')?.getAttribute('src');

  it('resolves relative images against the Markdown file, not the page', () => {
    expect(src('![Diagram](images/diagram.png)')).toBe('/assets/diagram-abc123.png');
    expect(src('![Diagram](./images/diagram.png)')).toBe('/assets/diagram-abc123.png');
  });

  it('resolves images in parent folders', () => {
    expect(src('![Cover](../covers/book.png)')).toBe('/assets/book-def456.png');
  });

  it('resolves file names with spaces (encoded or in angle brackets)', () => {
    expect(src('![x](my%20image.png)')).toBe('/assets/my-image-111.png');
    expect(src('![x](<my image.png>)')).toBe('/assets/my-image-111.png');
  });

  it('resolves images written in raw HTML', () => {
    expect(src('<img src="images/diagram.png" alt="d">')).toBe('/assets/diagram-abc123.png');
  });

  it('leaves absolute URLs and data URIs unchanged', () => {
    expect(src('![x](https://example.com/a.png)')).toBe('https://example.com/a.png');
    expect(src('![x](//cdn.example.com/a.png)')).toBe('//cdn.example.com/a.png');
    expect(src('![x](/static/a.png)')).toBe('/static/a.png');
    expect(src('![x](data:image/png;base64,iVBORw0KGgo=)')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(src('<img src="data:text/html;base64,PGI+">')).toBeUndefined(); // not an image → refused
  });

  it('replaces a missing image with a visible placeholder showing its alt text', () => {
    const { element } = render('Before ![Fork diagram](images/nope.png) after');
    expect(element.querySelector('img')).toBeNull();
    const marker = element.querySelector('.missing-image');
    expect(marker?.textContent).toBe('Fork diagram (image not found)');
    expect(marker?.getAttribute('title')).toBe('Image not found: images/nope.png');
    expect(element.textContent).toContain('Before');
    expect(element.textContent).toContain('after');
  });

  it('treats images that point outside the library as missing', () => {
    const { element } = render('![secret](../../../../etc/passwd)');
    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('.missing-image')).not.toBeNull();
  });

  it('handles a missing image without alt text', () => {
    expect(render('![](nope.png)').element.querySelector('.missing-image')?.textContent).toBe('Image not found');
  });
});

describe('links', () => {
  const link = (md: string) => render(md).element.querySelector('a, .broken-link');

  it('turns links to other books into internal routes', () => {
    expect(link('[next](<Lesson 1.md>)')?.getAttribute('href')).toBe('#/book/languages/russian/a1/lesson-1');
    expect(link('[next](Lesson%201.md)')?.getAttribute('href')).toBe('#/book/languages/russian/a1/lesson-1');
    expect(link('[up](../Overview.md)')?.getAttribute('href')).toBe('#/book/languages/russian/overview');
    expect(link('[other](../../../University/Notes.md)')?.getAttribute('href')).toBe('#/book/university/notes');
  });

  it('keeps the #heading of a link to another book', () => {
    expect(link('[x](../Overview.md#The%20alphabet)')?.getAttribute('href')).toBe('#/book/languages/russian/overview#The%20alphabet');
  });

  it('turns "#heading" links into routes of the current book, so the router does not treat them as pages', () => {
    expect(link('[jump](#study-tips)')?.getAttribute('href')).toBe('#/book/languages/russian/a1/alphabet#study-tips');
  });

  it('turns links to unknown books or outside the library into a broken-link marker (text kept)', () => {
    for (const md of ['[gone](Missing.md)', '[out](../../../../x.md)']) {
      const { element } = render(md);
      expect(element.querySelector('a'), md).toBeNull();
      const marker = element.querySelector('.broken-link');
      expect(marker?.textContent).toBe(md.slice(1, md.indexOf(']')));
      expect(marker?.getAttribute('title')).toBeTruthy();
    }
  });

  it('resolves links to other files stored in the library', () => {
    expect(link('[sheet](files/sheet.pdf)')?.getAttribute('href')).toBe('/assets/sheet-789.pdf');
    expect(link('[sheet](files/sheet.pdf#page=2)')?.getAttribute('href')).toBe('/assets/sheet-789.pdf#page%3D2');
    expect(link('[missing](files/none.pdf)')?.className).toBe('broken-link');
  });

  it('leaves external and root-absolute links alone', () => {
    expect(link('[a](https://example.com/x?y=1#z)')?.getAttribute('href')).toBe('https://example.com/x?y=1#z');
    expect(link('[m](mailto:me@example.com)')?.getAttribute('href')).toBe('mailto:me@example.com');
    expect(link('[r](/somewhere)')?.getAttribute('href')).toBe('/somewhere');
  });
});

describe('anchors', () => {
  const { element } = render('## Overview\n\ntext\n\n## Visão geral\n\nmore');

  it('finds headings by id, or by the slug of what the author wrote', () => {
    expect(findAnchorTarget(element, 'overview')?.textContent).toBe('Overview');
    expect(findAnchorTarget(element, 'Visão geral')?.textContent).toBe('Visão geral');
    expect(findAnchorTarget(element, 'nope')).toBeNull();
  });

  it('scrolls to the heading, or to the top when there is no anchor', () => {
    const scrolled: string[] = [];
    for (const heading of element.querySelectorAll('h2')) heading.scrollIntoView = () => void scrolled.push(heading.id);
    scrollToAnchor(element, 'overview');
    scrollToAnchor(element, 'unknown'); // missing anchors are ignored
    expect(scrolled).toEqual(['overview']);

    const calls: [number, number][] = [];
    scrollToAnchor(element, undefined, { scrollTo: (x: number, y: number) => calls.push([x, y]) } as unknown as Window);
    expect(calls).toEqual([[0, 0]]);
  });
});
