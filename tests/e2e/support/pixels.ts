import { inflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';

/**
 * The colour of one pixel of the page as it is painted. Playwright takes the screenshot; a PNG is a
 * zlib stream of filtered rows, so reading one pixel of a tiny clip needs nothing but `zlib`.
 */
export async function pixelAt(page: Page, x: number, y: number): Promise<[number, number, number]> {
  const png = await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 }, type: 'png' });
  return decodeFirstPixel(png);
}

function decodeFirstPixel(png: Buffer): [number, number, number] {
  let offset = 8; // PNG signature
  let width = 0;
  let channels = 3;
  const data: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      const colourType = body[9];
      channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 0;
      if (channels === 0 || body[8] !== 8) throw new Error(`unsupported PNG (colour type ${colourType}, depth ${body[8]})`);
    } else if (type === 'IDAT') data.push(body);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  if (width !== 1) throw new Error('expected a 1x1 PNG'); // (with no neighbours, every PNG filter leaves the first pixel as it is)
  return [raw[1], raw[2], raw[3]];
}

/** "rgb(…)" / "rgba(…)" / "#rrggbb" (what getComputedStyle and CSS variables give) → [r, g, b]. */
export function parseColour(css: string): [number, number, number] {
  const value = css.trim();
  if (value.startsWith('#')) {
    const hex = value.length === 4 ? [...value.slice(1)].map((c) => c + c).join('') : value.slice(1);
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  }
  const numbers = value.match(/[\d.]+/g)?.map(Number);
  if (!numbers || numbers.length < 3) throw new Error(`cannot read colour "${css}"`);
  return [numbers[0], numbers[1], numbers[2]];
}

/** `opacity` of `top` over `bottom`. */
export const mix = (top: number[], bottom: number[], opacity: number) => top.map((c, i) => c * opacity + bottom[i] * (1 - opacity));

export const farFrom = (a: number[], b: number[]) => Math.max(...a.map((c, i) => Math.abs(c - b[i])));
