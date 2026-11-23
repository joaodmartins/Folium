const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Natural, locale-independent comparison: "Lesson 2" < "Lesson 10". Ties fall back to code points. */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/** URL-safe lowercase slug of one path segment. Keeps letters/digits of any script; accents are removed from Latin letters. */
export function slugSegment(segment: string): string {
  const slug = segment
    .normalize('NFD')
    // Drop accents on Latin letters only ("ç" → "c"), so "й" or "ё" keep their identity.
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

/** Slug of a library-relative POSIX path: each segment slugged, joined with "/". "" stays "". */
export function slugPath(path: string): string {
  return path === '' ? '' : path.split('/').map(slugSegment).join('/');
}
