import { el } from '../dom';
import { toTree, type TocEntry, type TocNode } from '../reader/toc';

export interface TocPanel {
  /** The overlay (hidden while closed). It lies over the book without taking any of its space. */
  root: HTMLElement;
  readonly isOpen: boolean;
  /** Opens it with the active entry highlighted and focused. */
  open(activeId: string | null): void;
  /** Closes it and gives the focus back to what had it. */
  close(): void;
  /** Highlights an entry (while it is open). */
  setActive(id: string | null): void;
  destroy(): void;
}

export interface TocPanelOptions {
  entries: readonly TocEntry[];
  /** The reader chose an entry. The panel is already closed. */
  onSelect(entry: TocEntry): void;
  /** Called after it opened or closed (the toggle button follows). */
  onToggle?(open: boolean): void;
}

const FOCUSABLE = 'button:not([disabled])';

/**
 * The side panel listing the book's headings. A dialog over the book: Escape, the close button, the
 * backdrop or choosing an entry close it; Tab stays inside while it is open; the active entry is
 * marked with `aria-current` and scrolled into view.
 */
export function renderTocPanel(options: TocPanelOptions): TocPanel {
  const buttons = new Map<string, HTMLButtonElement>();

  const renderNode = (node: TocNode): HTMLElement => {
    const button = el('button', {
      type: 'button',
      class: 'toc__item',
      'data-testid': 'toc-item',
      'data-id': node.entry.id,
      'data-depth': String(node.entry.depth),
      'data-level': String(node.entry.level),
    });
    button.append(node.entry.label.cloneNode(true));
    button.addEventListener('click', () => {
      close();
      options.onSelect(node.entry);
    });
    buttons.set(node.entry.id, button);
    const item = el('li', { class: 'toc__entry' }, button);
    if (node.children.length > 0) item.append(el('ol', { class: 'toc__list' }, ...node.children.map(renderNode)));
    return item;
  };

  const closeButton = el('button', { type: 'button', class: 'toc__close', 'aria-label': 'Close table of contents', 'data-testid': 'toc-close' }, el('span', { 'aria-hidden': 'true' }, '×'));
  const backdrop = el('div', { class: 'toc__backdrop', 'data-testid': 'toc-backdrop' });
  const heading = el('h2', { class: 'toc__title', id: 'toc-title' }, 'Contents');
  const dialog = el(
    'section',
    { class: 'toc__panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'toc-title', 'data-testid': 'toc-panel' },
    el('header', { class: 'toc__header' }, heading, closeButton),
    el('nav', { class: 'toc__nav', 'aria-label': 'Table of contents' }, el('ol', { class: 'toc__list' }, ...toTree(options.entries).map(renderNode))),
  );
  const root = el('div', { class: 'toc', hidden: '' }, backdrop, dialog);

  let opened = false;
  let returnFocus: HTMLElement | null = null;

  function setActive(id: string | null) {
    for (const [entryId, button] of buttons) {
      if (entryId === id) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    }
    if (opened && id) buttons.get(id)?.scrollIntoView?.({ block: 'nearest' });
  }

  function open(activeId: string | null) {
    if (opened) return;
    opened = true;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.hidden = false;
    setActive(activeId);
    (activeId ? buttons.get(activeId) : undefined)?.focus({ preventScroll: true });
    if (!root.contains(document.activeElement)) (buttons.values().next().value ?? closeButton).focus({ preventScroll: true });
    document.addEventListener('keydown', onKeyDown, true);
    options.onToggle?.(true);
  }

  function close() {
    if (!opened) return;
    opened = false;
    root.hidden = true;
    document.removeEventListener('keydown', onKeyDown, true);
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
    options.onToggle?.(false);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    // keep the focus inside the dialog
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (!dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  closeButton.addEventListener('click', close);
  backdrop.addEventListener('click', close);

  return {
    root,
    get isOpen() {
      return opened;
    },
    open,
    close,
    setActive,
    destroy() {
      document.removeEventListener('keydown', onKeyDown, true);
      opened = false;
    },
  };
}
