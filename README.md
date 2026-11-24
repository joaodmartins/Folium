# Folium

Your personal digital library.

Folium is a personal project that turns Markdown files into digital books shown on a static website.

## Goal

Write content only in Markdown (`.md`), keep it in this repository, and let the website present it as a library of books: categories and subcategories, a page-based reader, a table of contents, and Light, Dark and Sepia reading modes. Adding a book should only mean adding a `.md` file (plus optional images and metadata) and pushing.

The project is intentionally simple: no backend, no database, no authentication, no APIs. Everything is a static site that can be hosted for free (for example on GitHub Pages).

## Current status

**Phases 0 to 4 of the plan are done, plus the "physical book" reading experience.** What exists today:

- Project tooling (Vite, TypeScript, Vitest, Playwright).
- A navigable library built from the manifest: home with the top-level categories, category pages at any depth (sub-categories and books, with breadcrumbs), a book page, and a "not found" page. Navigation uses hash routes, so it works on GitHub Pages and with the browser's back/forward buttons:
  `#/`, `#/category/languages/russian`, `#/book/languages/russian/a1/alphabet` (the cover), `#/read/languages/russian/a1/alphabet` (reading); the ids are the manifest ids.
- A Markdown reader on the book page: the book's `.md` is loaded only when the book is opened (via the manifest's `book.load()`), rendered with markdown-it, sanitized with DOMPurify and shown with reading typography. It supports headings, emphasis, lists, blockquotes, tables, code blocks (not highlighted yet), horizontal rules, links and images. Images and links are resolved relative to the Markdown file: `![d](images/d.png)` and `[next](<Lesson 2.md>)` work, and links to other books use the app's routes. Every heading gets a unique id, so `#/book/<id>#<heading>` opens a book at that heading.
- A cover page for every book: opening a book shows its cover (the `cover` image, or a printed cover made from the title and author), with the title, author, description, category and a "Start reading" button. The text is only loaded when you start reading.
- The open book: reading shows a slim bar (back, previous / page number / next, theme) and the book on a desk, using all the space. Wide screens show two pages side by side with a spine; narrow ones (phones, a tablet held upright) show one page. Pages turn with a 3D page-turn animation (a plain quick fade with `prefers-reduced-motion`). Pages are numbered individually (`1–2 / 500`, the last odd page alone); the current number is a button: click it, type a page, press Enter.
- Pages are CSS columns (one column = one page): the browser breaks lines and pages, and Folium measures the result, waits for fonts and images, and keeps the reader at the same place in the text when the window is resized or the device is rotated. A heading link (`#/book/<id>#heading`, `#/read/<id>#heading`) opens the view that contains it.
- Themes: Light, Dark and Sepia, chosen with three swatches in the reading bar and remembered in `localStorage`. They only change colours, never the layout.
- Mathematics: `$E = mc^2$` inline and `$$ … $$` as a centred block, rendered by KaTeX (installed locally, nothing from a CDN). A formula wider than the page scrolls inside itself; an invalid formula is shown as the TeX that was written, and the book still opens. In a table cell, write `\|` for a pipe inside a formula.
- Code: fenced blocks are syntax-highlighted by highlight.js (C, C++, Python, Java, JavaScript, TypeScript, HTML/XML, CSS, JSON, Bash/shell, SQL, YAML, Markdown; other languages, or none, are shown as plain text). Long lines wrap. A discreet "Copy" button copies the original code (not the highlighting).
- Table of contents: with `showTableOfContents: true` (in the frontmatter or a `_folder.json`/global default) and at least one heading, a Contents button in the reading bar opens a panel over the book with the H1–H3 headings, nested, the heading of the pages on screen marked, formulas rendered. Choosing a heading goes to its page (with a page turn when it is on the next or previous view) and closes the panel; Escape, the close button and a click outside close it too. It never changes the size of the book.
- Reading progress: Folium remembers where you stopped in each book (`localStorage`, one entry per book: the nearest heading, how far into its section, and the page as a fallback). Opening a book again continues there, even on another screen size, because the heading is used rather than the page. A heading in the link (`#/read/<id>#heading`) wins over the saved position. Nothing is synced between devices.
- Page breaks: `<!-- pagebreak -->` on its own line starts a new page; the book's `chapterBreak` (`h1`, `h2` or `none`, default `h1`) makes headings of that level (and above) start a new page.
- Covers: a book/category `cover` image from `Library/` is shown when it exists, otherwise a generated cover.
- A Vite plugin (`tools/vite-plugin-folium/`) that scans `Library/` and exposes every book and category as the virtual module `virtual:folium-library` (the *manifest*). It reads YAML frontmatter, `_folder.json` and `folium.config.json`, skips drafts and hidden files, validates the metadata, and reloads the dev server when files in `Library/` change.
- Two example Markdown books and example config files under `Library/`.

What does **not** exist yet (planned for later phases): reading settings (font size, line height). The page number depends on the screen size and text size, so it is not the same on every device.

## Technologies

- [Vite](https://vite.dev/) and TypeScript (vanilla, no UI framework)
- [Vitest](https://vitest.dev/) for unit tests
- [Playwright](https://playwright.dev/) for end-to-end tests (also the browser behind Vitest's browser mode), and [jsdom](https://github.com/jsdom/jsdom) for DOM unit tests, [markdown-it](https://github.com/markdown-it/markdown-it) and [DOMPurify](https://github.com/cure53/DOMPurify) for rendering books
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
npm test          # unit tests (Vitest: jsdom) + pagination tests (Vitest browser mode: Chromium)
npm run e2e       # end-to-end tests (Playwright) against the dev server (the real Library/ and a fixture library)
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
  views/                 Library (home), category, book cover, reader and not-found views
  components/            Breadcrumbs, cards, book cover, the open book frame, reader bar, page indicator, theme switcher
  state/                 Theme preference and reading progress (localStorage)
  reader/                Markdown pipeline: markdown, sanitize, resolve (links/images), headings, page breaks, source loader
  reader/toc.ts          The table of contents of a rendered book
  reader/layout.ts       Size of the open book (one page or two) for the space available
  reader/paginator/      The Paginator interface and its CSS-columns implementation
  reader/math.ts, highlight.ts, code-blocks.ts   KaTeX formulas, syntax highlighting, the Copy button
  reader/flip/           The page-turn animation (copies of the pages involved, drawn on top of the book)
  styles/                CSS (design tokens, base styles)
tests/
  unit/                  Vitest tests in jsdom (logic, DOM structure)
  browser/               Vitest tests in real Chromium (pagination needs real layout)
  e2e/                   Playwright tests
  fixtures/library/      Small library used by the unit tests
  fixtures/e2e-library/  Books written to stress pagination, used by the *.fixture.spec.ts e2e tests
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

Images, covers and files linked from a book live next to it in `Library/` (for example `Library/Languages/Russian/A1/images/diagram.png`) and are referenced with a path relative to the `.md` file.

Settings resolve in this order, the most specific winning: `folium.config.json` `defaults` → the `"defaults"` of each `_folder.json` from the top folder down → the book's frontmatter. `_folder.json` may also set `title`, `description`, `cover` and `order` for the category itself. Invalid values stop the build with the offending file and field.
