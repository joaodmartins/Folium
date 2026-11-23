import { slugSegment } from '../../tools/vite-plugin-folium/slug';

export interface Heading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  /** Unique id inside the book; also set as the `id` of the heading element. */
  id: string;
}

/**
 * Gives every heading under `root` a unique, readable id ("Intro", "Intro" → "intro", "intro-1")
 * and returns them in document order. Reusable by the future table of contents and paginator.
 */
export function assignHeadingIds(root: ParentNode): Heading[] {
  const used = new Set<string>();
  const headings: Heading[] = [];

  for (const element of root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')) {
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    const base = slugSegment(text);
    let id = base;
    for (let n = 1; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);

    element.id = id;
    headings.push({ level: Number(element.tagName[1]) as Heading['level'], text, id });
  }
  return headings;
}
