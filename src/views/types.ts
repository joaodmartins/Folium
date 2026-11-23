import type { AssetResolver } from '../assets';
import type { Library } from '../library';
import type { PaginatorFactory } from '../reader/paginator/types';
import type { SourceLoader } from '../reader/source';

/** Everything a view needs to render. */
export interface ViewContext {
  library: Library;
  assetUrl: AssetResolver;
  /** Loads a book's Markdown (the app passes a cached `book.load()`). */
  loadSource?: SourceLoader;
  /** Paginator engine. Default: CSS columns. */
  createPaginator?: PaginatorFactory;
}

/** A rendered page plus the document title to show for it. */
export interface Page {
  title: string;
  element: HTMLElement;
  /** Called when only the `#anchor` of the same book's route changed (no re-render). */
  onAnchorChange?: (anchor: string | undefined) => void;
  /** Called when the page is replaced: release listeners and observers. */
  destroy?: () => void;
}
