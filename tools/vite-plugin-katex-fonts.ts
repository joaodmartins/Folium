import type { Plugin } from 'vite';

/**
 * KaTeX's stylesheet lists every font three times (woff2, woff, ttf), and Vite would copy all of
 * them into the build. Every browser that can run Folium supports woff2, so the other two are
 * dropped: a third of the files, and about two thirds of the bytes.
 */
export default function katexFonts(): Plugin {
  return {
    name: 'folium-katex-fonts',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]katex[\\/]dist[\\/].*\.css(\?|$)/.test(id)) return undefined;
      return { code: code.replace(/,url\([^)]*\.(?:woff|ttf)\)\s*format\("[^"]+"\)/g, ''), map: null };
    },
  };
}
