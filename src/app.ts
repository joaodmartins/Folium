import { resolveAsset, type AssetResolver } from './assets';
import type { Library } from './library';
import type { PaginatorFactory } from './reader/paginator/types';
import { createSourceLoader, loadFromManifest, type SourceLoader } from './reader/source';
import { parseHash, resolveRoute, type ResolvedRoute } from './router';
import { renderBookView } from './views/book-view';
import { renderCategoryView } from './views/category-view';
import { renderLibraryView } from './views/library-view';
import { renderNotFoundView } from './views/not-found-view';
import type { Page, ViewContext } from './views/types';

export interface AppOptions {
  assetUrl?: AssetResolver;
  /** Loads a book's Markdown. Default: the manifest's lazy `book.load()`, cached per app. */
  loadSource?: SourceLoader;
  /** Paginator engine for books. Default: CSS columns. */
  createPaginator?: PaginatorFactory;
  /** Window to listen on (defaults to the global one). */
  win?: Window;
}

/** Renders the view for a hash against the library. */
export function renderRoute(
  hash: string,
  library: Library,
  assetUrl: AssetResolver,
  loadSource?: SourceLoader,
  createPaginator?: PaginatorFactory,
): Page {
  return renderResolved(resolveRoute(parseHash(hash), library), { library, assetUrl, loadSource, createPaginator });
}

function renderResolved(route: ResolvedRoute, context: ViewContext): Page {
  switch (route.name) {
    case 'home':
      return renderLibraryView(context);
    case 'category':
      return renderCategoryView(context, route.category);
    case 'book':
      return renderBookView(context, route.book, route.anchor);
    case 'not-found':
      return renderNotFoundView(context, route.hash);
  }
}

/**
 * Mounts the app: renders the current route now and again on every `hashchange`
 * (links, address bar, and the browser's back/forward buttons). Returns an unmount function.
 */
export function mountApp(container: HTMLElement, library: Library, options: AppOptions = {}): () => void {
  const win = options.win ?? window;
  const assetUrl = options.assetUrl ?? resolveAsset;

  const loadSource = options.loadSource ?? createSourceLoader(loadFromManifest);

  let current: { bookId?: string; page: Page } | undefined;

  const render = () => {
    const route = resolveRoute(parseHash(win.location.hash), library);

    // Same book, different #heading: just move there, do not rebuild the book.
    if (route.name === 'book' && current?.bookId === route.book.id && current.page.onAnchorChange) {
      current.page.onAnchorChange(route.anchor);
      return;
    }

    current?.page.destroy?.();
    const page = renderResolved(route, { library, assetUrl, loadSource, createPaginator: options.createPaginator });
    current = { bookId: route.name === 'book' ? route.book.id : undefined, page };
    container.replaceChildren(page.element);
    win.document.title = page.title;
    win.scrollTo?.(0, 0);
    // Move focus to the new page's heading so keyboard/screen-reader users notice the change.
    page.element.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  };

  win.addEventListener('hashchange', render);
  render();
  return () => {
    win.removeEventListener('hashchange', render);
    current?.page.destroy?.();
    current = undefined;
  };
}
