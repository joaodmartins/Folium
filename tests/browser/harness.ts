import { vi } from 'vitest';
import '../../src/styles/tokens.css';
import '../../src/styles/app.css';
import { renderBookFrame, type BookFrame } from '../../src/components/book-frame';
import { renderReaderBar, type ReaderBar } from '../../src/components/reader-bar';
import { createPageTurner, type PageTurner } from '../../src/reader/flip/turner';
import { GUTTER, type BookLayout } from '../../src/reader/layout';
import { createColumnsPaginator, type ColumnsOptions } from '../../src/reader/paginator/columns';
import type { Paginator } from '../../src/reader/paginator/types';
import { renderMarkdown } from '../../src/reader/render';
import type { ChapterBreak } from '../../tools/vite-plugin-folium/types';

export const GAP = GUTTER; // the space between two pages the reader uses

export interface Mounted {
  /** The area available to the book (what the reader's stage is). */
  stage: HTMLElement;
  frame: BookFrame;
  /** The reader's top bar, wired to the paginator like the real reader does. */
  bar: ReaderBar;
  /** The rendered book content (the multi-column element). */
  content: HTMLElement;
  /** The clipped window onto the pages. */
  viewport: HTMLElement;
  paginator: Paginator;
  /** Draws page turns; moves the paginator like the reader does. */
  turner: PageTurner;
  /** The layout in use (sizes of the book and its pages). */
  layout: BookLayout;
  /** Pages shown at once, as chosen for this book (1, or 2 for an open book). */
  pages: number;
  /** Resizes the area available to the book and waits until the paginator has reacted. */
  resize(width: number, height: number): Promise<void>;
  /** Same, without waiting (for tests that look at what happens in between). */
  setSize(width: number, height: number): void;
  /** Switches between one page and an open book (the reader does this when the screen changes). */
  setPages(pages: 1 | 2): Promise<void>;
  destroy(): void;
}

export interface MountOptions extends ColumnsOptions {
  width?: number;
  height?: number;
  /** 2 mounts an open book (two pages side by side). Default: 1. */
  pages?: 1 | 2;
  /** For the page turner: length of a turn in ms, and whether reduced motion is on. */
  turnDuration?: number;
  reducedMotion?: boolean;
  chapterBreak?: ChapterBreak;
}

export const frames = (count = 4) =>
  new Promise<void>((resolve) => {
    let left = count;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });

const mounted: Mounted[] = [];

/** A layout with fixed margins, for tests that want to control the size of the pages. */
export function testLayout(width: number, height: number, pages: 1 | 2): BookLayout {
  return {
    pages,
    pageWidth: Math.floor(width / pages),
    pageHeight: height,
    marginX: 20,
    marginY: 16,
    gutter: GUTTER,
    bookWidth: width,
  };
}

/** Renders Markdown with the real pipeline and paginates it inside a stage of the given size. */
export async function mountBook(markdown: string, options: MountOptions = {}): Promise<Mounted> {
  const { width = 500, height = 420, pages = 1, chapterBreak = 'none', turnDuration, reducedMotion, ...paginatorOptions } = options;
  let currentPages: 1 | 2 = pages;
  let currentLayout = testLayout(width, height, pages);

  const { element: content } = renderMarkdown(markdown, {
    title: 'Test book',
    bookId: 'test',
    bookPath: 'Test/Book.md',
    findBookByPath: () => undefined,
    assetUrl: () => undefined,
    chapterBreak,
  });

  const frame = renderBookFrame(content);
  const stage = document.createElement('div');
  stage.className = 'reader-stage'; // the same container the app uses
  stage.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px`;
  stage.append(frame.root);
  document.body.append(stage);
  frame.applyLayout(currentLayout);

  const paginator = await createColumnsPaginator(frame.viewport, content, {
    animate: false,
    gap: GUTTER,
    pagesPerView: () => currentPages,
    ...paginatorOptions,
  });

  const bar = renderReaderBar({
    backHref: '#/',
    backLabel: 'Library',
    theme: 'light',
    onTheme: () => {},
    onGoToPage: (page) => paginator.goTo(page),
    onPrev: () => void paginator.prev(),
    onNext: () => void paginator.next(),
  });
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0';
  holder.append(bar.root);
  document.body.append(holder);
  const show = () => bar.update({ page: paginator.page, pagesPerView: paginator.pagesPerView, pageCount: paginator.pageCount });
  paginator.onChange(show);
  show();

  const turner = createPageTurner({
    paginator,
    content,
    book: frame.root,
    viewport: frame.viewport,
    flipLayer: frame.flipLayer,
    layout: () => currentLayout,
    duration: turnDuration,
    reducedMotion: reducedMotion === undefined ? undefined : () => reducedMotion,
  });

  const setSize = (w: number, h: number) => {
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    turner.finish();
    currentLayout = testLayout(w, h, currentPages);
    frame.applyLayout(currentLayout);
  };

  const book: Mounted = {
    stage,
    frame,
    bar,
    content,
    viewport: frame.viewport,
    paginator,
    turner,
    get layout() {
      return currentLayout;
    },
    get pages() {
      return currentPages;
    },
    setSize,
    async resize(w, h) {
      setSize(w, h);
      await frames(5);
    },
    async setPages(next) {
      currentPages = next;
      turner.finish();
      currentLayout = testLayout(stage.offsetWidth, stage.offsetHeight, next);
      frame.applyLayout(currentLayout);
      paginator.refresh(); // like the reader: the window may keep its size when the book opens or closes
      await frames(5);
    },
    destroy() {
      turner.destroy();
      paginator.destroy();
      stage.remove();
      holder.remove();
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

// ---- words on a page: to compare the real book with the copies drawn while a page turns ------

/** Each word of the text under `root` with its box. */
function wordBoxes(root: Element): { word: string; rect: DOMRect }[] {
  const out: { word: string; rect: DOMRect }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (node.parentElement?.closest('[hidden], script, style')) continue;
    const re = /\S+/g;
    for (let match = re.exec(node.data); match; match = re.exec(node.data)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const rect = range.getClientRects()[0];
      if (rect && rect.width > 0) out.push({ word: match[0], rect });
    }
  }
  return out;
}

/** The words that are on page `page` of the real book, in reading order. */
export function wordsOfRealPage(book: Mounted, page: number): string[] {
  const { left, step } = geometry(book);
  return wordBoxes(book.content)
    .filter(({ rect }) => Math.floor((rect.left - left + 1) / step) === page)
    .map(({ word }) => word);
}

/** The words shown in a copy of a page (the text window of a face). */
export function wordsOfFace(face: Element): string[] {
  const window = face.querySelector('.flip__window');
  if (!window) return [];
  const area = window.getBoundingClientRect();
  return wordBoxes(window)
    .filter(({ rect }) => rect.left >= area.left - 1 && rect.left < area.right - 1)
    .map(({ word }) => word);
}
