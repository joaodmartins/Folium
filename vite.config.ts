import { defineConfig } from 'vite';
import folium from './tools/vite-plugin-folium/index.ts';

// `base: './'` keeps asset URLs relative, so the built site works from any
// sub-path (e.g. https://<user>.github.io/Folium/) without extra configuration.
export default defineConfig({
  base: './',
  // FOLIUM_LIBRARY points the app at another library folder (the e2e tests use a fixture library).
  plugins: [folium({ libraryDir: process.env.FOLIUM_LIBRARY })],
});
