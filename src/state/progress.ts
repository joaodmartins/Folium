/**
 * Reading progress, kept in the browser (`localStorage`, one entry per book).
 *
 * The number of pages depends on the screen and the text size, so the page alone cannot say where the
 * reader was on another day or device. A position is the nearest heading before the pages on screen
 * (stable: it comes from the book) plus how far into that heading's section the reader was; the page
 * is kept only as a fallback.
 */

export interface Progress {
  /** Id of the nearest heading at or before the first visible page, or null before the first heading. */
  heading: string | null;
  /** How far into that heading's section the reader was: 0 (its first page) up to just under 1. */
  fraction: number;
  /** First visible page when it was saved (0-based): used only if the heading no longer exists. */
  page: number;
  savedAt: number;
}

/** Where a heading starts, in page order (what the reader measures from the real layout). */
export interface HeadingStart {
  id: string;
  /** 0-based page on which the heading starts. */
  startPage: number;
}

const keyFor = (bookId: string) => `folium:progress:${bookId}`;

/** `localStorage` can be missing or throw (private windows, blocked site data): never rely on it. */
function storageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function parse(raw: string | null): Progress | null {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') return null;
    const { heading, fraction, page, savedAt } = data;
    if (heading !== null && typeof heading !== 'string') return null;
    if (!isNumber(fraction) || fraction < 0 || fraction > 1) return null;
    if (!isNumber(page) || page < 0 || !Number.isInteger(page)) return null;
    return { heading, fraction, page, savedAt: isNumber(savedAt) ? savedAt : 0 };
  } catch {
    return null; // not JSON: ignore it, the book simply starts at the beginning
  }
}

export function loadProgress(bookId: string, storage: Storage | null = storageOrNull()): Progress | null {
  try {
    return parse(storage?.getItem(keyFor(bookId)) ?? null);
  } catch {
    return null;
  }
}

/** Returns whether it was saved (it is not an error when it was not). */
export function saveProgress(bookId: string, progress: Progress, storage: Storage | null = storageOrNull()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(keyFor(bookId), JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function clearProgress(bookId: string, storage: Storage | null = storageOrNull()): void {
  try {
    storage?.removeItem(keyFor(bookId));
  } catch {
    // nothing to do
  }
}

/** The last heading that starts on or before `page` (starts are in reading order). */
export function headingAt(starts: readonly HeadingStart[], page: number): HeadingStart | null {
  let found: HeadingStart | null = null;
  for (const start of starts) {
    if (start.startPage > page) break;
    found = start;
  }
  return found;
}

/** The pages of the section that begins at `from`: up to the next heading on a later page, or the end. */
function sectionEnd(starts: readonly HeadingStart[], from: number, pageCount: number): number {
  const later = starts.find((start) => start.startPage > from);
  return Math.max(from + 1, later?.startPage ?? pageCount);
}

/** Where the reader is, as a heading and a fraction of its section. */
export function describePosition(
  starts: readonly HeadingStart[],
  page: number,
  pageCount: number,
): Pick<Progress, 'heading' | 'fraction' | 'page'> {
  const current = headingAt(starts, page);
  const from = current?.startPage ?? 0;
  const to = sectionEnd(starts, from, pageCount);
  const fraction = Math.min(Math.max((page - from) / (to - from), 0), 0.999);
  return { heading: current?.id ?? null, fraction, page };
}

/**
 * The first visible page to open a book at. Preferably from the heading (it survives another screen
 * size); else from the saved page (kept inside the book); with nothing saved, the first page.
 */
export function resolveRestore(saved: Progress | null, starts: readonly HeadingStart[], pageCount: number): number {
  if (!saved || pageCount <= 0) return 0;
  const last = pageCount - 1;

  if (saved.heading === null) {
    // Before the first heading (or a book without any): the fraction of that stretch.
    const to = sectionEnd(starts, 0, pageCount);
    return Math.min(Math.max(Math.floor(saved.fraction * to), 0), last);
  }

  const heading = starts.find((start) => start.id === saved.heading);
  if (!heading) return Math.min(Math.max(saved.page, 0), last); // the heading is gone: the saved page, kept inside the book

  const to = sectionEnd(starts, heading.startPage, pageCount);
  const page = heading.startPage + Math.floor(saved.fraction * (to - heading.startPage));
  return Math.min(Math.max(page, heading.startPage), Math.min(to - 1, last));
}
