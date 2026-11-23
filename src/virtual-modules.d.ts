// Types of the virtual modules provided by tools/vite-plugin-folium.
declare module 'virtual:folium-library' {
  import type { LibraryManifest, LoadableBook } from '../tools/vite-plugin-folium/types';

  /** Every visible book and the category tree, generated from Library/ at build/dev time. */
  export const manifest: LibraryManifest<LoadableBook>;
  export default manifest;
}
