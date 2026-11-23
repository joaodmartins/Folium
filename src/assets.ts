// Images stored next to the books (covers). Vite resolves them to their final (hashed) URLs.
const images = import.meta.glob('/Library/**/*.{png,jpg,jpeg,gif,webp,avif,svg}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** URL of a library-relative asset path (as found in the manifest), if the file exists. */
export type AssetResolver = (libraryPath: string | undefined) => string | undefined;

export const resolveAsset: AssetResolver = (libraryPath) =>
  libraryPath === undefined ? undefined : images[`/Library/${libraryPath}`];
