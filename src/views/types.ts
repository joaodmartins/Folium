import type { AssetResolver } from '../assets';
import type { Library } from '../library';

/** Everything a view needs to render. */
export interface ViewContext {
  library: Library;
  assetUrl: AssetResolver;
}

/** A rendered page plus the document title to show for it. */
export interface Page {
  title: string;
  element: HTMLElement;
}
