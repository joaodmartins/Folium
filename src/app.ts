import { resolveAsset, type AssetResolver } from './assets';
import type { Library } from './library';
import { parseHash, resolveRoute } from './router';
import { renderBookView } from './views/book-view';
import { renderCategoryView } from './views/category-view';
import { renderLibraryView } from './views/library-view';
import { renderNotFoundView } from './views/not-found-view';
import type { Page } from './views/types';

export interface AppOptions {
  assetUrl?: AssetResolver;
  /** Window to listen on (defaults to the global one). */
  win?: Window;
}

/** Renders the view for a hash against the library. */
export function renderRoute(hash: string, library: Library, assetUrl: AssetResolver): Page {
  const context = { library, assetUrl };
  const route = resolveRoute(parseHash(hash), library);
  switch (route.name) {
    case 'home':
      return renderLibraryView(context);
    case 'category':
      return renderCategoryView(context, route.category);
    case 'book':
      return renderBookView(context, route.book);
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

  const render = () => {
    const page = renderRoute(win.location.hash, library, assetUrl);
    container.replaceChildren(page.element);
    win.document.title = page.title;
    win.scrollTo?.(0, 0);
    // Move focus to the new page's heading so keyboard/screen-reader users notice the change.
    page.element.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  };

  win.addEventListener('hashchange', render);
  render();
  return () => win.removeEventListener('hashchange', render);
}
