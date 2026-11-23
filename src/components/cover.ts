import { el } from '../dom';

/** Stable hue (0-359) for a string, so a book/category always gets the same generated cover. */
export function hueFor(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % 360;
}

/** Cover image when there is one; otherwise a generated cover (colour + initial). */
export function renderCover(title: string, seed: string, url?: string): HTMLElement {
  if (url) {
    return el('div', { class: 'cover' }, el('img', { class: 'cover__image', src: url, alt: '', loading: 'lazy' }));
  }
  const cover = el('div', { class: 'cover cover--generated', 'aria-hidden': 'true' }, el('span', {}, [...title][0]?.toUpperCase() ?? '?'));
  cover.style.setProperty('--cover-hue', String(hueFor(seed)));
  return cover;
}
