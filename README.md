# Folium

Your personal digital library.

Folium is a personal project that turns Markdown files into digital books shown on a static website.

## Goal

Write content only in Markdown (`.md`), keep it in this repository, and let the website present it as a library of books: categories and subcategories, a page-based reader, a table of contents, and Light, Dark and Sepia reading modes. Adding a book should only mean adding a `.md` file (plus optional images and metadata) and pushing.

The project is intentionally simple: no backend, no database, no authentication, no APIs. Everything is a static site that can be hosted for free (for example on GitHub Pages).

## Current status

**Phase 0 (scaffold) only.** What exists today:

- Project tooling (Vite, TypeScript, Vitest, Playwright).
- A static landing page with the Folium identity and placeholder cards.
- Two example Markdown books and example config files under `Library/`.

What does **not** exist yet (planned for later phases): automatic book discovery, Markdown rendering, categories navigation, the reader, pagination, math (KaTeX), syntax highlighting, theme switching and reading settings. The example books are not read by the application yet.

## Technologies

- [Vite](https://vite.dev/) and TypeScript (vanilla, no UI framework)
- [Vitest](https://vitest.dev/) for unit tests
- [Playwright](https://playwright.dev/) for end-to-end tests
- npm
- GitHub Pages as the future deployment target

## Getting started

Requires Node.js 20+ (developed with Node 24).

```bash
npm install
npx playwright install chromium   # one-off, needed only for e2e tests

npm run dev       # start the dev server (http://localhost:5173)
npm run build     # type-check and build to dist/
npm run preview   # serve the production build
npm test          # unit tests (Vitest)
npm run e2e       # end-to-end tests (Playwright)
npm run typecheck # TypeScript only
```

## Project layout

```
Library/                 Your content: categories are folders, books are .md files
  Languages/Russian/A1/Alphabet.md
  University/Operating Systems/Theory/Lesson 1.md
  **/_folder.json        Optional per-folder metadata (title, order, defaults)
folium.config.json       Global site configuration
src/                     Application code
  styles/                CSS (design tokens, base styles)
  views/                 Future views (library, reader)
  reader/                Future Markdown rendering and pagination
tests/
  unit/                  Vitest tests
  e2e/                   Playwright tests
  fixtures/library/      Small library used by tests
.github/workflows/       Future deployment workflow
```

## Adding books

Books will live in `Library/`. A folder is a category, a `.md` file is a book, and metadata goes in optional YAML frontmatter at the top of the file. The example files show the intended format, but the application does not read them yet.
