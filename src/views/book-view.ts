import type { Book } from '../../tools/vite-plugin-folium/types';
import { bookCrumbs, renderBreadcrumbs } from '../components/breadcrumbs';
import { renderCover } from '../components/cover';
import { el } from '../dom';
import { scrollToAnchor } from '../reader/anchors';
import { loadFromManifest } from '../reader/source';
import { categoryHash } from '../router';
import type { Page, ViewContext } from './types';

/** Book page: header with the book's details, then its Markdown content (loaded on demand). */
export function renderBookView(ctx: ViewContext, book: Book, anchor?: string): Page {
  const { library, assetUrl } = ctx;
  const category = library.getCategory(book.categoryId) ?? library.root;

  const details: [string, Node | string][] = [];
  if (book.meta.author) details.push(['Author', book.meta.author]);
  details.push(['Category', el('a', { href: categoryHash(category) }, category.title)]);
  details.push(['Language', book.meta.language]);

  const content = el('section', {
    class: 'reader',
    'data-testid': 'book-content',
    'aria-label': 'Book content',
    lang: book.meta.language,
  });

  const element = el(
    'main',
    { class: 'page', id: 'main' },
    renderBreadcrumbs(bookCrumbs(library, book)),
    el(
      'header',
      { class: 'book-header' },
      renderCover(book.title, book.id, assetUrl(book.meta.cover)),
      el(
        'div',
        { class: 'book-header__text' },
        el('h1', { class: 'page__title', tabindex: '-1' }, book.title),
        book.meta.description ? el('p', { class: 'page__lead' }, book.meta.description) : null,
        el('dl', { class: 'details' }, ...details.flatMap(([term, value]) => [el('dt', {}, term), el('dd', {}, value)])),
      ),
    ),
    content,
  );

  let currentAnchor = anchor;
  let rendered: HTMLElement | undefined;
  let attempt = 0; // only the latest attempt may touch the page (retries, slow loads)

  const showLoading = () => {
    content.setAttribute('aria-busy', 'true');
    content.replaceChildren(el('p', { class: 'reader__status', role: 'status' }, 'Loading book…'));
  };

  const showError = (error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    const retry = el('button', { type: 'button', class: 'button' }, 'Try again');
    retry.addEventListener('click', () => void load());
    content.setAttribute('aria-busy', 'false');
    content.replaceChildren(
      el(
        'div',
        { class: 'reader__error', role: 'alert' },
        el('p', { class: 'reader__error-title' }, `We could not load “${book.title}”.`),
        el('p', { class: 'reader__error-detail' }, `Check your connection and try again. (${detail})`),
        retry,
      ),
    );
  };

  async function load() {
    const mine = ++attempt;
    rendered = undefined;
    showLoading();
    try {
      const loadSource = ctx.loadSource ?? loadFromManifest;
      // The Markdown renderer (markdown-it + DOMPurify) is only downloaded when a book is opened.
      const [source, { renderMarkdown }] = await Promise.all([loadSource(book), import('../reader/render')]);
      if (mine !== attempt) return;

      const result = renderMarkdown(source, {
        title: book.title,
        bookId: book.id,
        bookPath: book.path,
        findBookByPath: (path) => library.getBookByPath(path),
        assetUrl: (path) => assetUrl(path),
      });
      // Images that fail to load (broken URL, offline…) get a visible placeholder instead.
      result.element.addEventListener(
        'error',
        (event) => {
          if (event.target instanceof HTMLImageElement) replaceBrokenImage(event.target);
        },
        true,
      );

      rendered = result.element;
      content.setAttribute('aria-busy', 'false');
      content.replaceChildren(result.element);
      if (currentAnchor) scrollToAnchor(rendered, currentAnchor);
    } catch (error) {
      if (mine === attempt) showError(error);
    }
  }

  void load();

  return {
    title: `${book.title} · ${library.title}`,
    element,
    onAnchorChange(next) {
      currentAnchor = next;
      if (rendered) scrollToAnchor(rendered, next); // still loading: scrolled once the content is ready
    },
  };
}

function replaceBrokenImage(img: HTMLImageElement) {
  const alt = img.getAttribute('alt') ?? '';
  const marker = el('span', { class: 'missing-image', title: `Could not load ${img.getAttribute('src') ?? 'image'}` });
  marker.textContent = alt ? `${alt} (image could not be loaded)` : 'Image could not be loaded';
  img.replaceWith(marker);
}
