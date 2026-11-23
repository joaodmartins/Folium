import { hashFor } from '../router';
import { folderOf, isExternal, isRootAbsolute, resolveLibraryPath, splitHref } from './paths';

export interface ResolveContext {
  /** Id and library-relative path of the book being rendered. */
  bookId: string;
  bookPath: string;
  /** Another book of the library, by its file path (undefined for drafts or unknown files). */
  findBookByPath(path: string): { id: string } | undefined;
  /** Final URL of a file stored in Library/ (undefined when it does not exist). */
  assetUrl(path: string): string | undefined;
}

/** Replaces an element by a visible "missing" marker, keeping its readable content. */
function markBroken(element: Element, kind: 'image' | 'link', reason: string, label: string) {
  const marker = document.createElement('span');
  marker.className = kind === 'image' ? 'missing-image' : 'broken-link';
  marker.title = reason;
  if (kind === 'image') marker.textContent = label ? `${label} (image not found)` : 'Image not found';
  else marker.append(...element.childNodes);
  element.replaceWith(marker);
}

/** Inline images must really be images (a `data:text/html` "image" is refused). */
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i;

function resolveImage(img: HTMLImageElement, ctx: ResolveContext) {
  const src = img.getAttribute('src') ?? '';
  const alt = img.getAttribute('alt') ?? '';
  if (src === '') return markBroken(img, 'image', 'Image has no source', alt);
  if (/^data:/i.test(src) && !SAFE_DATA_IMAGE.test(src)) return markBroken(img, 'image', 'Unsupported inline image', alt);
  if (isExternal(src) || isRootAbsolute(src)) return; // absolute URLs are left alone

  const { path } = splitHref(src);
  const resolved = resolveLibraryPath(folderOf(ctx.bookPath), path);
  const url = resolved === null ? undefined : ctx.assetUrl(resolved);
  if (url === undefined) return markBroken(img, 'image', `Image not found: ${src}`, alt);
  img.setAttribute('src', url);
}

function resolveLink(link: HTMLAnchorElement, ctx: ResolveContext) {
  const href = link.getAttribute('href');
  if (href === null || href === '') return;

  if (isExternal(href)) {
    if (/^(https?:)?\/\//i.test(href)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
    return;
  }
  if (isRootAbsolute(href)) return;

  // "#heading": a heading of this same book, expressed as a route.
  if (href.startsWith('#')) {
    const { anchor } = splitHref(href);
    link.setAttribute('href', hashFor({ name: 'book', id: ctx.bookId, anchor }));
    return;
  }

  const { path, anchor } = splitHref(href);
  const resolved = resolveLibraryPath(folderOf(ctx.bookPath), path);
  if (resolved === null) return markBroken(link, 'link', `Link leaves the library: ${href}`, '');

  if (/\.md$/i.test(resolved)) {
    const book = ctx.findBookByPath(resolved);
    if (!book) return markBroken(link, 'link', `Book not found: ${href}`, '');
    link.setAttribute('href', hashFor({ name: 'book', id: book.id, anchor: anchor || undefined }));
    return;
  }

  const url = ctx.assetUrl(resolved);
  if (url === undefined) return markBroken(link, 'link', `File not found: ${href}`, '');
  link.setAttribute('href', anchor ? `${url}#${encodeURIComponent(anchor)}` : url);
}

/** Rewrites relative image sources and link targets so they work from the app's pages. */
export function resolveLinksAndImages(root: ParentNode, ctx: ResolveContext): void {
  for (const img of root.querySelectorAll('img')) resolveImage(img, ctx);
  for (const link of root.querySelectorAll('a')) resolveLink(link, ctx);
}
