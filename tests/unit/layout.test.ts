import { describe, expect, it } from 'vitest';
import { computeBookLayout, EDGE, GUTTER, sameLayout, textArea } from '../../src/reader/layout';

describe('computeBookLayout', () => {
  it('opens the book (two pages) on a desktop screen and uses the full height', () => {
    const layout = computeBookLayout({ width: 1280, height: 660 });
    expect(layout.pages).toBe(2);
    expect(layout.pageHeight).toBe(660 - 2 * EDGE);
    expect(layout.bookWidth).toBe(layout.pageWidth * 2);
    expect(layout.bookWidth).toBeLessThanOrEqual(1280 - 2 * EDGE);
  });

  it('keeps pages at a book-like proportion on very large screens, instead of stretching lines', () => {
    const layout = computeBookLayout({ width: 2560, height: 1300 });
    expect(layout.pages).toBe(2);
    expect(layout.pageWidth / layout.pageHeight).toBeCloseTo(0.72, 1);
    expect(layout.bookWidth).toBeLessThan(2560 - 2 * EDGE - 400); // does not fill the width: the desk shows around it
  });

  it('fills the width when the screen is narrower than the ideal pages', () => {
    const layout = computeBookLayout({ width: 900, height: 700 });
    expect(layout.pages).toBe(2);
    expect(layout.bookWidth).toBe(layout.pageWidth * 2);
    expect(layout.bookWidth).toBeGreaterThanOrEqual(900 - 2 * EDGE - 1);
  });

  it('opens the book on a tablet held sideways, and shows one page when it is held upright', () => {
    expect(computeBookLayout({ width: 1024, height: 700 }).pages).toBe(2);
    expect(computeBookLayout({ width: 768, height: 960 }).pages).toBe(1);
  });

  it('shows one page at a time on a phone, held either way', () => {
    const upright = computeBookLayout({ width: 390, height: 700 });
    expect(upright.pages).toBe(1);
    expect(upright.pageWidth).toBe(390 - 2 * EDGE);
    expect(upright.pageHeight).toBe(700 - 2 * EDGE);
    expect(upright.bookWidth).toBe(upright.pageWidth);

    const sideways = computeBookLayout({ width: 844, height: 340 });
    expect(sideways.pages).toBe(1); // too short for two pages of readable text
  });

  it('never makes a single page wider than a comfortable line length', () => {
    const layout = computeBookLayout({ width: 700, height: 300 });
    expect(layout.pages).toBe(1);
    expect(layout.pageWidth).toBeLessThanOrEqual(736);
    expect(computeBookLayout({ width: 900, height: 380 }).pageWidth).toBeLessThanOrEqual(736);
  });

  it('leaves room for text: margins are positive and the text area fits inside the book', () => {
    for (const area of [{ width: 1280, height: 660 }, { width: 390, height: 700 }, { width: 1024, height: 700 }, { width: 320, height: 480 }]) {
      const layout = computeBookLayout(area);
      const text = textArea(layout);
      expect(layout.marginX).toBeGreaterThan(0);
      expect(layout.marginY).toBeGreaterThan(0);
      expect(text.width).toBeGreaterThan(0);
      expect(text.height).toBeGreaterThan(0);
      expect(layout.bookWidth).toBeLessThanOrEqual(area.width - 2 * EDGE);
      expect(layout.pageHeight).toBeLessThanOrEqual(area.height - 2 * EDGE);
    }
  });

  it('each text column of an open book is wide enough to read', () => {
    const layout = computeBookLayout({ width: 1000, height: 640 });
    expect(layout.pages).toBe(2);
    const column = (textArea(layout).width - GUTTER) / 2;
    expect(column).toBeGreaterThanOrEqual(300);
  });

  it('copes with no space at all', () => {
    const layout = computeBookLayout({ width: 0, height: 0 });
    expect(layout.pages).toBe(1);
    expect(layout.pageWidth).toBe(0);
    expect(layout.pageHeight).toBe(0);
  });

  it('is deterministic, and sameLayout compares sizes and mode', () => {
    const a = computeBookLayout({ width: 1280, height: 660 });
    expect(computeBookLayout({ width: 1280, height: 660 })).toEqual(a);
    expect(sameLayout(a, computeBookLayout({ width: 1280, height: 660 }))).toBe(true);
    expect(sameLayout(a, computeBookLayout({ width: 1280, height: 600 }))).toBe(false);
    expect(sameLayout(a, computeBookLayout({ width: 390, height: 700 }))).toBe(false);
  });

  it('switches between one page and the open book as the screen changes (rotation)', () => {
    const portrait = computeBookLayout({ width: 768, height: 960 });
    const landscape = computeBookLayout({ width: 960, height: 768 });
    expect([portrait.pages, landscape.pages]).toEqual([1, 2]);
  });
});
