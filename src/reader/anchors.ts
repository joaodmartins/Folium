import { slugSegment } from '../../tools/vite-plugin-folium/slug';

/** Heading (or element) of the book for an anchor: exact id first, then its slug ("Visão" → "visao"). */
export function findAnchorTarget(root: ParentNode, anchor: string): HTMLElement | null {
  const byId = (id: string) => root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
  return byId(anchor) ?? byId(slugSegment(anchor));
}

/** Scrolls to the anchor inside the rendered book, or to the top when there is none. */
export function scrollToAnchor(root: ParentNode, anchor: string | undefined, win: Window = window): void {
  if (!anchor) {
    win.scrollTo?.(0, 0);
    return;
  }
  findAnchorTarget(root, anchor)?.scrollIntoView?.({ block: 'start' });
}
