import { el } from '../dom';

/**
 * "7" → 7, " 12 " → 12. Anything that is not a whole number from 1 to `pageCount`
 * (empty, "0", "-3", "2.5", "abc", "1e3", "99999") → null.
 */
export function parsePageNumber(text: string, pageCount: number): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= 1 && value <= pageCount ? value : null;
}

export interface PageView {
  /** First visible page, 0-based. */
  page: number;
  /** Pages on screen (1 or 2). */
  pagesPerView: number;
  pageCount: number;
}

export interface PageIndicator {
  root: HTMLElement;
  update(state: PageView): void;
  /** Closes the number field without going anywhere. */
  cancelEdit(): void;
  readonly editing: boolean;
}

/**
 * "253 / 500" (or "253–254 / 500" when two pages are open). The current page number is a button:
 * it turns into a field where another page number can be typed (Enter goes, Escape cancels).
 */
export function renderPageIndicator(goToPage: (page: number) => void): PageIndicator {
  const root = el('div', { class: 'pager', 'data-testid': 'page-indicator' });
  let state: PageView = { page: 0, pagesPerView: 1, pageCount: 0 };
  let input: HTMLInputElement | null = null;

  // These elements live as long as the indicator: updating them (instead of rebuilding) keeps keyboard focus.
  const current = el('button', { type: 'button', class: 'pager__current', 'data-testid': 'page-current' });
  const range = el('span', { class: 'pager__range' });
  const total = el('span', { class: 'pager__total' });

  const first = () => state.page + 1;
  const last = () => Math.min(state.page + state.pagesPerView, state.pageCount);

  function labelFor(): string {
    return first() === last() ? `Page ${first()} of ${state.pageCount}` : `Pages ${first()} and ${last()} of ${state.pageCount}`;
  }

  function render() {
    if (state.pageCount === 0) return root.replaceChildren();
    current.textContent = String(first());
    current.setAttribute('aria-label', `${labelFor()}. Go to another page`);
    range.textContent = last() > first() ? `–${last()}` : '';
    total.textContent = ` / ${state.pageCount}`;
    const wanted = last() > first() ? [current, range, total] : [current, total];
    if (root.childNodes.length !== wanted.length || wanted.some((node, i) => root.childNodes[i] !== node)) {
      root.replaceChildren(...wanted);
    }
  }

  current.addEventListener('click', startEdit);

  function startEdit() {
    if (input || state.pageCount === 0) return;
    const field = el('input', {
      type: 'text',
      class: 'pager__input',
      inputmode: 'numeric',
      autocomplete: 'off',
      spellcheck: 'false',
      'data-testid': 'page-input',
      'aria-label': `Go to page (1 to ${state.pageCount})`,
      size: String(String(state.pageCount).length + 1),
    });
    field.value = String(first());
    input = field;
    total.textContent = ` / ${state.pageCount}`;
    root.replaceChildren(field, total);
    root.classList.add('pager--editing');

    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });
    field.addEventListener('input', clearError);
    field.addEventListener('blur', () => {
      if (input === field) cancelEdit(); // tapping away dismisses the field
    });
    field.focus();
    field.select();
  }

  function clearError() {
    input?.removeAttribute('aria-invalid');
    root.querySelector('.pager__error')?.remove();
  }

  function commit() {
    if (!input) return;
    const page = parsePageNumber(input.value, state.pageCount);
    if (page === null) {
      // Stay in the field, say what is expected, and go nowhere.
      clearError();
      input.setAttribute('aria-invalid', 'true');
      root.append(el('span', { class: 'pager__error', role: 'alert' }, `Enter a page from 1 to ${state.pageCount}`));
      input.select();
      return;
    }
    closeEdit();
    current.focus(); // so the arrow keys keep working
    goToPage(page - 1);
  }

  function closeEdit() {
    input = null;
    root.classList.remove('pager--editing');
    render();
  }

  function cancelEdit() {
    if (!input) return;
    const hadFocus = document.activeElement === input;
    closeEdit();
    if (hadFocus) current.focus();
  }

  return {
    root,
    update(next) {
      state = next;
      if (input) {
        // Keep what the reader is typing; only the total may have changed.
        input.setAttribute('aria-label', `Go to page (1 to ${state.pageCount})`);
        return;
      }
      render();
    },
    cancelEdit,
    get editing() {
      return input !== null;
    },
  };
}
