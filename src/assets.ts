// Files stored next to the books (images, covers, and a few common attachments).
// Vite resolves them to their final (hashed) URLs. Markdown files are not assets.
const images = import.meta.glob('/Library/**/*.{png,jpg,jpeg,gif,webp,avif,svg,pdf,mp3,mp4,webm,ogg,wav,zip,txt,csv}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** URL of a library-relative asset path (as found in the manifest), if the file exists. */
export type AssetResolver = (libraryPath: string | undefined) => string | undefined;

export const resolveAsset: AssetResolver = (libraryPath) =>
  libraryPath === undefined ? undefined : images[`/Library/${libraryPath}`];
