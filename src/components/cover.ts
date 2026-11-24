import { el } from '../dom';

/** Stable hue (0-359) for a string, so a book/category always gets the same generated cover. */
export function hueFor(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % 360;
}

function generatedCover(title: string, seed: string): HTMLElement {
  const cover = el('div', { class: 'cover cover--generated', 'aria-hidden': 'true' }, el('span', {}, [...title][0]?.toUpperCase() ?? '?'));
  cover.style.setProperty('--cover-hue', String(hueFor(seed)));
  return cover;
}

/**
 * Thumbnail of a book or category: the cover image when there is one, otherwise a generated
 * cover (colour + initial). If the image cannot be loaded the generated cover takes its place,
 * so a card never shows a broken-image icon. The thumbnail is decorative: the card's title
 * already names the link.
 */
export function renderCover(title: string, seed: string, url?: string): HTMLElement {
  if (!url) return generatedCover(title, seed);

  const image = el('img', { class: 'cover__image', src: url, alt: '', loading: 'lazy' });
  const cover = el('div', { class: 'cover' }, image);
  image.addEventListener(
    'error',
    () => {
      cover.replaceWith(generatedCover(title, seed));
    },
    { once: true },
  );
  return cover;
}
