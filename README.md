# Folium

Your personal digital library.

Folium is a personal project that turns Markdown files into digital books shown on a static website.

## Goal

Write content only in Markdown (`.md`), keep it in this repository, and let the website present it as a library of books: categories and subcategories, a page-based reader, a table of contents, and Light, Dark and Sepia reading modes. Adding a book should only mean adding a `.md` file (plus optional images and metadata) and pushing.

The project is intentionally simple: no backend, no database, no authentication, no APIs. Everything is a static site that can be hosted for free (for example on GitHub Pages).

## Current status

**Phases 0, 1 and 2 of the plan are done.** What exists today:

- Project tooling (Vite, TypeScript, Vitest, Playwright).
- A navigable library built from the manifest: home with the top-level categories, category pages at any depth (sub-categories and books, with breadcrumbs), a book page, and a "not found" page. Navigation uses hash routes, so it works on GitHub Pages and with the browser's back/forward buttons:
  `#/`, `#/category/languages/russian`, `#/book/languages/russian/a1/alphabet` (the ids are the manifest ids).
- Covers: a book/category `cover` image from `Library/` is shown when it exists, otherwise a generated cover.
- A Vite plugin (`tools/vite-plugin-folium/`) that scans `Library/` and exposes every book and category as the virtual module `virtual:folium-library` (the *manifest*). It reads YAML frontmatter, `_folder.json` and `folium.config.json`, skips drafts and hidden files, validates the metadata, and reloads the dev server when files in `Library/` change.
- Two example Markdown books and example config files under `Library/`.

What does **not** exist yet (planned for later phases): Markdown rendering and the reader (the book page shows a content placeholder), pagination, math (KaTeX), syntax highlighting, theme switching and reading settings.

## Technologies

- [Vite](https://vite.dev/) and TypeScript (vanilla, no UI framework)
- [Vitest](https://vitest.dev/) for unit tests
- [Playwright](https://playwright.dev/) for end-to-end tests, and [happy-dom](https://github.com/capricorn86/happy-dom) for DOM unit tests
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
npm run e2e       # end-to-end tests (Playwright) against the dev server
npm run e2e:preview  # the same tests against the production build
npm run typecheck # TypeScript only
```

## Project layout

```
Library/                 Your content: categories are folders, books are .md files
  Languages/Russian/A1/Alphabet.md
  University/Operating Systems/Theory/Lesson 1.md
  **/_folder.json        Optional per-folder metadata (title, order, defaults)
folium.config.json       Global site configuration
tools/vite-plugin-folium/  Vite plugin: discovers books and builds the manifest
src/                     Application code
  router.ts, library.ts  Hash routes and lookups over the manifest
  app.ts, main.ts        Mounts the app and renders the current route
  views/                 Library (home), category, book and not-found views
  components/            Breadcrumbs, cards, covers
  styles/                CSS (design tokens, base styles)
  reader/                Future Markdown rendering and pagination
tests/
  unit/                  Vitest tests
  e2e/                   Playwright tests
  fixtures/library/      Small library used by tests
.github/workflows/       Future deployment workflow
```

## Adding books

Books live in `Library/`. A folder is a category (any depth), a `.md` file is a book, and metadata goes in optional YAML frontmatter at the top of the file. No code changes are needed: add the file and the manifest picks it up.

```markdown
---
title: Russian A1 - Lesson 1     # optional: else the first "# H1", else the file name
author: João Martins
description: Introduction to the Russian alphabet
cover: cover.jpg                 # relative to the .md file
language: en
showTableOfContents: true
order: 1                         # optional: else natural name order ("Lesson 2" < "Lesson 10")
chapterBreak: h1                 # h1 | h2 | none
draft: false                     # true hides the book
---
```

Settings resolve in this order, the most specific winning: `folium.config.json` `defaults` → the `"defaults"` of each `_folder.json` from the top folder down → the book's frontmatter. `_folder.json` may also set `title`, `description`, `cover` and `order` for the category itself. Invalid values stop the build with the offending file and field.
