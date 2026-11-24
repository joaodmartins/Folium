import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  codeBlock,
  denseCode,
  frames,
  mountBook,
  paragraphs,
  pngImage,
  range,
  wordsOfFace,
  wordsOfRealPage,
  type Mounted,
} from './harness';
import { renderFace } from '../../src/reader/flip/faces';

afterEach(cleanup);

/** A book with different kinds of content, so pages start in the middle of paragraphs, lists, code, tables. */
const RICH = [
  '# Title',
  paragraphs(4),
  '## Section A',
  range(14).map((i) => `- list item ${i} with some words to fill the line`).join('\n'),
  paragraphs(3, 40, 10),
  codeBlock(34),
  '> a short quote\n> over two lines',
  ['| h1 | h2 |', '|---|---|', ...range(24).map((i) => `| cell ${i} | value ${i} |`)].join('\n'),
  '## Section B',
  paragraphs(6, 55, 30),
  '1. first\n2. second\n3. third',
  paragraphs(3, 40, 50),
].join('\n\n');

const open = (markdown: string, options: Parameters<typeof mountBook>[1] = {}) =>
  mountBook(markdown, { pages: 2, width: 900, height: 420, turnDuration: 80, ...options });

const leaf = (book: Mounted) => book.frame.flipLayer.querySelector<HTMLElement>('.flip__leaf');
const layerIsEmpty = (book: Mounted) => book.frame.flipLayer.childElementCount === 0;
const waitUntilDone = (book: Mounted) => vi.waitFor(() => expect(book.turner.busy).toBe(false), { timeout: 3000 });
const keyframes = (animation: Animation) => (animation.effect as KeyframeEffect).getKeyframes();

describe('copies of the pages (what is drawn while a page turns)', () => {
  it('show exactly the text of the real page: every page of a varied book', async () => {
    const book = await open(RICH);
    const size = book.paginator.pageSize;
    const paper = { width: book.layout.pageWidth, height: book.layout.pageHeight, textLeft: book.layout.marginX, textTop: book.layout.marginY };
    expect(book.paginator.pageCount).toBeGreaterThan(8);

    for (let page = 0; page < book.paginator.pageCount; page++) {
      const face = renderFace(book.content, page, size, paper, 'flip__face--still')!;
      expect(face, `page ${page} can be copied`).not.toBeNull();
      book.frame.flipLayer.replaceChildren(face);
      await frames(1);
      const real = wordsOfRealPage(book, page);
      expect(real.length, `page ${page} has text`).toBeGreaterThan(0);
      expect(wordsOfFace(face), `copy of page ${page}`).toEqual(real);
    }
  });

  it('a copy has no ids (they must stay unique), is not focusable, and is hidden from screen readers', async () => {
    const book = await open(`## Heading\n\n[a link](https://example.com)\n\n${paragraphs(2)}`);
    const size = book.paginator.pageSize;
    const paper = { width: 400, height: 400, textLeft: 20, textTop: 16 };
    const face = renderFace(book.content, 0, size, paper, 'x')!;
    expect(face.querySelector('[id]')).toBeNull();
    const text = face.querySelector('.flip__window > div')!;
    expect(text.hasAttribute('inert')).toBe(true);
    expect(text.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelectorAll('[id="heading"]')).toHaveLength(1); // only the real heading
  });

  it('a blank page is only paper', async () => {
    const book = await open(paragraphs(10));
    const face = renderFace(book.content, null, book.paginator.pageSize, { width: 300, height: 300, textLeft: 10, textTop: 10 }, 'x')!;
    expect(face.querySelector('.flip__window')).toBeNull();
    expect(wordsOfFace(face)).toEqual([]);
  });

  it('refuses to copy a page of a block that is too long to copy cheaply', async () => {
    const book = await open(`${paragraphs(30)}\n\n${denseCode(400)}\n\n${paragraphs(30, 40, 40)}`, { width: 700, height: 260 });
    const paper = { width: 340, height: 260, textLeft: 20, textTop: 16 };
    const onPage = book.paginator.pageOf(book.content.querySelector('pre')!);
    expect(book.paginator.pageCount).toBeGreaterThan(onPage + 2);
    expect(renderFace(book.content, onPage, book.paginator.pageSize, paper, 'x')).toBeNull();
    expect(renderFace(book.content, 0, book.paginator.pageSize, paper, 'x')).not.toBeNull(); // the pages around it can be copied
  });
});

describe('turning a page of the open book', () => {
  it('moves the real book to its destination at once: page numbers are right from the first frame', async () => {
    const book = await open(paragraphs(80));
    expect(book.turner.turn(1)).toBe(true);
    expect(book.paginator.page).toBe(2);
    expect(book.bar.indicator.root.textContent).toBe(`3–4 / ${book.paginator.pageCount}`);
    expect(book.turner.busy).toBe(true);
    await waitUntilDone(book);
    expect(book.paginator.page).toBe(2);
  });

  it('forward: the right page is the leaf and turns from 0° to −180°, over a copy of the old left page', async () => {
    const book = await open(paragraphs(80));
    const before = { left: wordsOfRealPage(book, 0), right: wordsOfRealPage(book, 1), newLeft: wordsOfRealPage(book, 2) };
    book.turner.turn(1);

    const turning = leaf(book)!;
    expect(book.frame.root.getAttribute('data-turning')).toBe('true');
    expect(book.frame.root.getAttribute('data-turn')).toBe('forward');
    const [rotation] = turning.getAnimations();
    const frames_ = keyframes(rotation);
    expect(frames_[0].transform).toBe('rotateY(0deg)');
    expect(frames_.at(-1)!.transform).toBe('rotateY(-180deg)');
    expect(parseFloat(turning.style.left)).toBe(book.layout.pageWidth); // it sits on the right-hand page
    expect(parseFloat(turning.style.width)).toBe(book.layout.pageWidth);

    // At the start of the turn the screen still shows the old spread: copy of the old left page, leaf front = old right page.
    const still = book.frame.flipLayer.querySelector('.flip__still .flip__face')!;
    expect(wordsOfFace(still)).toEqual(before.left);
    expect(wordsOfFace(turning.querySelector('.flip__face--front')!)).toEqual(before.right);
    // …and its back is the new left page, which it lands on.
    expect(wordsOfFace(turning.querySelector('.flip__face--back')!)).toEqual(before.newLeft);
    await waitUntilDone(book);
  });

  it('backward: the left page is the leaf and turns from −180° to 0°, landing on a copy of the old right page', async () => {
    const book = await open(paragraphs(80));
    book.paginator.goTo(4);
    await frames(2);
    const before = { oldLeft: wordsOfRealPage(book, 4), oldRight: wordsOfRealPage(book, 5), newRight: wordsOfRealPage(book, 3) };

    expect(book.turner.turn(-1)).toBe(true);
    expect(book.paginator.page).toBe(2);
    expect(book.frame.root.getAttribute('data-turn')).toBe('backward');
    const turning = leaf(book)!;
    const frames_ = keyframes(turning.getAnimations()[0]);
    expect(frames_[0].transform).toBe('rotateY(-180deg)');
    expect(frames_.at(-1)!.transform).toBe('rotateY(0deg)');

    expect(wordsOfFace(turning.querySelector('.flip__face--back')!)).toEqual(before.oldLeft); // starts as the left page…
    expect(wordsOfFace(turning.querySelector('.flip__face--front')!)).toEqual(before.newRight); // …lands as page 4
    const still = book.frame.flipLayer.querySelector('.flip__still .flip__face')!;
    expect(wordsOfFace(still)).toEqual(before.oldRight);
    await waitUntilDone(book);
  });

  it('adds shadows that grow and fade during the turn (the page has depth)', async () => {
    const book = await open(paragraphs(80));
    book.turner.turn(1);
    const shades = [...book.frame.flipLayer.querySelectorAll('.flip__shade')];
    expect(shades.length).toBeGreaterThanOrEqual(3); // both faces of the leaf, and the page it covers
    for (const shade of shades) expect(shade.getAnimations().length).toBe(1);
    await waitUntilDone(book);
  });

  it('ends cleanly: no layer, no marks, the book shows the destination', async () => {
    const book = await open(paragraphs(80));
    book.turner.turn(1);
    await waitUntilDone(book);
    expect(layerIsEmpty(book)).toBe(true);
    expect(book.frame.root.hasAttribute('data-turning')).toBe(false);
    expect(book.frame.root.hasAttribute('data-turn')).toBe(false);
    expect(book.frame.root.getAnimations({ subtree: true })).toHaveLength(0);
  });

  it('the real content is never copied wholesale: a copy holds only the blocks of its own page', async () => {
    const book = await open(paragraphs(200));
    book.turner.turn(1);
    const copied = book.frame.flipLayer.querySelectorAll('p').length;
    expect(copied).toBeLessThan(book.content.querySelectorAll('p').length / 10);
    await waitUntilDone(book);
  });

  it('cannot go beyond the first or last view, and then draws nothing', async () => {
    const book = await open(paragraphs(40));
    expect(book.turner.turn(-1)).toBe(false);
    expect(layerIsEmpty(book)).toBe(true);
    expect(book.paginator.page).toBe(0);
    book.paginator.goTo(book.paginator.pageCount - 1);
    expect(book.turner.turn(1)).toBe(false);
    expect(layerIsEmpty(book)).toBe(true);
  });

  it('the last view of an odd book turns back, over a blank right page', async () => {
    const book = await open(['A', 'B', 'C', 'D', 'E'].map((n) => `Page ${n} text.`).join('\n\n<!-- pagebreak -->\n\n'));
    book.paginator.goTo(4);
    await frames(2);
    expect(book.turner.turn(-1)).toBe(true);
    expect(book.paginator.page).toBe(2);
    expect(book.frame.flipLayer.querySelector('.flip__still')).toBeNull(); // nothing was on the right
    await waitUntilDone(book);
  });
});

describe('quick turns and interruptions', () => {
  it('only one turn is ever drawn: a new turn first ends the running one', async () => {
    const book = await open(paragraphs(200), { turnDuration: 400 });
    for (let i = 1; i <= 6; i++) {
      expect(book.turner.turn(1)).toBe(true);
      expect(book.frame.flipLayer.querySelectorAll('.flip__leaf')).toHaveLength(1);
      expect(book.frame.flipLayer.querySelectorAll('.flip__still')).toHaveLength(1);
      expect(book.paginator.page).toBe(i * 2); // every click counts
      expect(book.bar.indicator.root.textContent).toBe(`${i * 2 + 1}–${i * 2 + 2} / ${book.paginator.pageCount}`);
    }
    await waitUntilDone(book);
    expect(layerIsEmpty(book)).toBe(true);
    expect(book.paginator.page).toBe(12);
  });

  it('forward and backward in quick succession end where the clicks add up', async () => {
    const book = await open(paragraphs(200), { turnDuration: 400 });
    for (const direction of [1, 1, 1, -1, 1, -1, -1] as const) book.turner.turn(direction);
    expect(book.paginator.page).toBe(2);
    expect(book.frame.flipLayer.querySelectorAll('.flip__leaf')).toHaveLength(1);
    await waitUntilDone(book);
    expect(layerIsEmpty(book)).toBe(true);
    expect(book.paginator.page).toBe(2);
  });

  it('hammering past the end leaves a consistent book', async () => {
    const book = await open(paragraphs(40), { turnDuration: 200 });
    let moved = 0;
    for (let i = 0; i < 40; i++) if (book.turner.turn(1)) moved++;
    expect(moved).toBeLessThan(40);
    expect(book.paginator.page).toBe(book.paginator.pageCount - 1 - ((book.paginator.pageCount - 1) % 2));
    await waitUntilDone(book);
    expect(layerIsEmpty(book)).toBe(true);
    expect(book.bar.nextButton.disabled).toBe(true);
    expect(book.bar.prevButton.disabled).toBe(false);
  });

  it('finish() ends the running turn at once, and the book stays at its destination', async () => {
    const book = await open(paragraphs(80), { turnDuration: 5000 });
    book.turner.turn(1);
    expect(book.turner.busy).toBe(true);
    book.turner.finish();
    expect(book.turner.busy).toBe(false);
    expect(layerIsEmpty(book)).toBe(true);
    expect(book.frame.root.hasAttribute('data-turning')).toBe(false);
    expect(book.paginator.page).toBe(2);
    book.turner.finish(); // harmless when nothing runs
  });

  it('jumping to a page (index, anchor) ends the turn first, then the jump is exact', async () => {
    const book = await open(paragraphs(200), { turnDuration: 5000 });
    book.turner.turn(1);
    book.turner.finish();
    book.paginator.goTo(9);
    expect(book.paginator.page).toBe(8);
    expect(layerIsEmpty(book)).toBe(true);
    await frames(2);
    expect(wordsOfRealPage(book, 8).length).toBeGreaterThan(0);
  });

  it('a resize while turning ends the turn and the new size is applied correctly', async () => {
    const book = await open(paragraphs(200), { turnDuration: 5000 });
    book.paginator.goTo(10);
    await frames(2);
    book.turner.turn(1);
    await book.resize(1000, 480); // setSize() finishes the running turn, like the reader does
    expect(book.turner.busy).toBe(false);
    expect(layerIsEmpty(book)).toBe(true);
    expect(book.paginator.page % 2).toBe(0);
    expect(book.paginator.page).toBeGreaterThan(0);
  });

  it('after being destroyed it draws nothing', async () => {
    const book = await open(paragraphs(80));
    book.turner.destroy();
    expect(book.turner.turn(1)).toBe(false);
    expect(layerIsEmpty(book)).toBe(true);
  });
});

describe('reduced motion and pages that cannot be copied', () => {
  it('with reduced motion there is no 3D: the pages change at once, with a short fade', async () => {
    const book = await open(paragraphs(80), { reducedMotion: true });
    expect(book.turner.turn(1)).toBe(true);
    expect(book.paginator.page).toBe(2);
    expect(leaf(book)).toBeNull();
    expect(layerIsEmpty(book)).toBe(true);
    expect(book.frame.flipLayer.querySelector('.flip__face')).toBeNull();
    const [fade] = book.viewport.getAnimations();
    expect((fade.effect as KeyframeEffect).getKeyframes().map((k) => k.opacity)).toEqual(['0.35', '1']);
    expect((fade.effect as KeyframeEffect).getTiming().duration).toBeLessThanOrEqual(200); // quick
    await waitUntilDone(book);
    expect(book.viewport.getAnimations()).toHaveLength(0);
  });

  it('reduced motion also applies to quick turns and to turning back', async () => {
    const book = await open(paragraphs(80), { reducedMotion: true });
    for (let i = 0; i < 3; i++) book.turner.turn(1);
    book.turner.turn(-1);
    expect(book.paginator.page).toBe(4);
    expect(leaf(book)).toBeNull();
    await waitUntilDone(book);
  });

  it('a page that cannot be copied (a huge block) is turned with the same quick fade, not left broken', async () => {
    const book = await open(`${paragraphs(30)}\n\n${denseCode(400)}\n\n${paragraphs(30, 40, 40)}`, { width: 700, height: 260, turnDuration: 80 });
    book.paginator.goTo(book.paginator.pageOf(book.content.querySelector('pre')!)); // the view that holds the block that cannot be copied
    await frames(2);
    const before = book.paginator.page;
    expect(book.turner.turn(1)).toBe(true);
    expect(book.paginator.page).toBe(before + 2);
    expect(leaf(book)).toBeNull();
    await waitUntilDone(book);
    expect(layerIsEmpty(book)).toBe(true);
  });
});

describe('turning a single page (small screens)', () => {
  const single = (markdown: string, options: Parameters<typeof mountBook>[1] = {}) =>
    mountBook(markdown, { pages: 1, width: 380, height: 520, turnDuration: 80, ...options });

  it('forward: the page lifts like a leaf over the next one, whose text is already in place', async () => {
    const book = await single(paragraphs(80));
    const first = wordsOfRealPage(book, 0);
    book.turner.turn(1);
    expect(book.paginator.page).toBe(1);
    const turning = leaf(book)!;
    expect(wordsOfFace(turning.querySelector('.flip__face--front')!)).toEqual(first);
    expect(wordsOfFace(turning.querySelector('.flip__face--back')!)).toEqual([]); // the back of a leaf is blank paper
    expect(book.frame.flipLayer.querySelector('.flip__still')).toBeNull(); // the real next page is underneath
    expect(keyframes(turning.getAnimations()[0]).at(-1)!.transform).toBe('rotateY(-180deg)');
    expect(parseFloat(turning.style.left)).toBe(0);
    await waitUntilDone(book);
  });

  it('backward: the previous page comes down over the one being left', async () => {
    const book = await single(paragraphs(80));
    book.paginator.goTo(3);
    await frames(2);
    const left = wordsOfRealPage(book, 3);
    const previous = wordsOfRealPage(book, 2);
    book.turner.turn(-1);
    expect(book.paginator.page).toBe(2);
    expect(wordsOfFace(book.frame.flipLayer.querySelector('.flip__still .flip__face')!)).toEqual(left);
    expect(wordsOfFace(leaf(book)!.querySelector('.flip__face--front')!)).toEqual(previous);
    expect(keyframes(leaf(book)!.getAnimations()[0])[0].transform).toBe('rotateY(-180deg)');
    await waitUntilDone(book);
  });

  it('works with images, code and long content', async () => {
    const book = await single(`${paragraphs(3)}\n\n${pngImage(300, 900)}\n\n${codeBlock(30)}\n\n${paragraphs(4, 40, 10)}`);
    for (let i = 0; i < book.paginator.pageCount - 1; i++) {
      expect(book.turner.turn(1), `turn ${i}`).toBe(true);
      await vi.waitFor(() => expect(book.turner.busy).toBe(false), { timeout: 3000 });
    }
    expect(book.paginator.page).toBe(book.paginator.pageCount - 1);
  });
});
