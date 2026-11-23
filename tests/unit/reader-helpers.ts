import { renderMarkdown, type RenderContext } from '../../src/reader/render';

export const BOOK_PATH = 'Languages/Russian/A1/Alphabet.md';

/** Files "stored" in the fake library: path → URL, and Markdown files: path → book id. */
export const ASSETS: Record<string, string> = {
  'Languages/Russian/A1/images/diagram.png': '/assets/diagram-abc123.png',
  'Languages/Russian/covers/book.png': '/assets/book-def456.png',
  'Languages/Russian/A1/files/sheet.pdf': '/assets/sheet-789.pdf',
  'Languages/Russian/A1/my image.png': '/assets/my-image-111.png',
};
export const BOOKS: Record<string, { id: string }> = {
  'Languages/Russian/A1/Lesson 1.md': { id: 'languages/russian/a1/lesson-1' },
  'Languages/Russian/Overview.md': { id: 'languages/russian/overview' },
  'University/Notes.md': { id: 'university/notes' },
};

export function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    title: 'Russian Alphabet',
    bookId: 'languages/russian/a1/alphabet',
    bookPath: BOOK_PATH,
    findBookByPath: (path) => BOOKS[path],
    assetUrl: (path) => ASSETS[path],
    ...overrides,
  };
}

export function render(markdown: string, overrides: Partial<RenderContext> = {}) {
  return renderMarkdown(markdown, makeContext(overrides));
}

/** HTML of the rendered content, for readable assertions. */
export const html = (markdown: string, overrides: Partial<RenderContext> = {}) => render(markdown, overrides).element.innerHTML;
