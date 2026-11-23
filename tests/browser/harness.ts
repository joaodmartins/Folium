import { vi } from 'vitest';
import '../../src/styles/tokens.css';
import '../../src/styles/app.css';
import { renderBookSheet, type BookSheet } from '../../src/components/book-sheet';
import { createColumnsPaginator, type ColumnsOptions } from '../../src/reader/paginator/columns';
import type { Paginator } from '../../src/reader/paginator/types';
import { renderMarkdown } from '../../src/reader/render';
import type { ChapterBreak } from '../../tools/vite-plugin-folium/types';

export const GAP = 40; // the paginator's default gap between pages

export interface Mounted {
  stage: HTMLElement;
  sheet: BookSheet;
  /** The rendered book content (the multi-column element). */
  content: HTMLElement;
  /** The clipped window of one page. */
  viewport: HTMLElement;
  paginator: Paginator;
  /** Resizes the area available to the book and waits until the paginator has reacted. */
  resize(width: number, height: number): Promise<void>;
  destroy(): void;
}

export interface MountOptions extends ColumnsOptions {
  width?: number;
  height?: number;
  chapterBreak?: ChapterBreak;
}

export const frames = (count = 4) =>
  new Promise<void>((resolve) => {
    let left = count;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });

const mounted: Mounted[] = [];

/** Renders Markdown with the real pipeline and paginates it inside a stage of the given size. */
export async function mountBook(markdown: string, options: MountOptions = {}): Promise<Mounted> {
  const { width = 500, height = 420, chapterBreak = 'none', ...paginatorOptions } = options;

  const { element: content } = renderMarkdown(markdown, {
    title: 'Test book',
    bookId: 'test',
    bookPath: 'Test/Book.md',
    findBookByPath: () => undefined,
    assetUrl: () => undefined,
    chapterBreak,
  });

  const sheet = renderBookSheet(content);
  const stage = document.createElement('div');
  stage.className = 'reader'; // same container the app uses: it gives the book its size
  stage.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px`;
  stage.append(sheet.root);
  document.body.append(stage);

  const paginator = await createColumnsPaginator(sheet.viewport, content, { animate: false, ...paginatorOptions });
  paginator.onChange((state) => sheet.update(state));
  sheet.update({ page: paginator.page, pageCount: paginator.pageCount });

  const book: Mounted = {
    stage,
    sheet,
    content,
    viewport: sheet.viewport,
    paginator,
    async resize(w, h) {
      stage.style.width = `${w}px`;
      stage.style.height = `${h}px`;
      await frames(5);
    },
    destroy() {
      paginator.destroy();
      stage.remove();
    },
  };
  mounted.push(book);
  return book;
}

export function cleanup() {
  for (const book of mounted.splice(0)) book.destroy();
}

// ---- measuring, independent of the paginator -----------------------------------------------

/** Horizontal geometry of the pages: where page 0 starts and the distance between pages. */
export function geometry(book: Mounted) {
  const box = book.content.getBoundingClientRect();
  return { left: box.left, step: book.content.offsetWidth + GAP };
}

/** All the boxes (one per page the element touches) of an element. */
export const fragmentsOf = (element: Element) => [...element.getClientRects()];

/** Page (0-based) of a rectangle, computed from its position in the multi-column layout. */
export function pageOfRect(book: Mounted, rect: DOMRect): number {
  const { left, step } = geometry(book);
  return Math.floor((rect.left - left + 1) / step);
}

/** Pages touched by an element. */
export const pagesOf = (book: Mounted, element: Element) => [...new Set(fragmentsOf(element).map((r) => pageOfRect(book, r)))];

/** Boxes of an element that are inside the visible page window. */
export function visibleFragments(book: Mounted, element: Element): DOMRect[] {
  const view = book.viewport.getBoundingClientRect();
  return fragmentsOf(element).filter((r) => r.right > view.left + 1 && r.left < view.right - 1 && r.width > 0);
}

/** Line boxes of a text-heavy element (works for <pre>, which is one element but many lines). */
export function lineRects(element: Element): DOMRect[] {
  const range = document.createRange();
  range.selectNodeContents(element);
  return [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
}

export const range = (n: number) => Array.from({ length: n }, (_, i) => i);

// ---- test content ---------------------------------------------------------------------------

const WORDS = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega'.split(' ');

/** "P7 alpha beta …": a numbered paragraph of about `words` words. */
export function paragraph(n: number, words = 40): string {
  return `P${n} ` + range(words).map((i) => WORDS[(n * 7 + i * 3) % WORDS.length]).join(' ') + '.';
}

export const paragraphs = (count: number, words = 40, from = 1) =>
  range(count).map((i) => paragraph(from + i, words)).join('\n\n');

export const codeBlock = (lines: number, prefix = 'line') =>
  '```c\n' + range(lines).map((i) => `${prefix} ${i + 1}: int value_${i} = compute(${i}); /* comment */`).join('\n') + '\n```';

/** A solid-colour PNG of the given size as an inline data URI, so no file is needed. */
export function pngImage(width: number, height: number, alt = 'big image'): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#b4532a';
  context.fillRect(0, 0, width, height);
  return `![${alt}](${canvas.toDataURL('image/png')})`;
}

export const settle = async (ms = 0) => {
  await frames(3);
  if (ms) await new Promise((r) => setTimeout(r, ms));
  await vi.waitFor(() => {}, { timeout: 100 });
};
