import { defineConfig } from 'vite';

// `base: './'` keeps asset URLs relative, so the built site works from any
// sub-path (e.g. https://<user>.github.io/Folium/) without extra configuration.
export default defineConfig({
  base: './',
});
