// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTocPanel, type TocPanel } from '../../src/components/toc-panel';
import { buildToc, type TocEntry } from '../../src/reader/toc';
import { render } from './reader-helpers';

const BOOK = '# Book\n\n## One\n\n### One A\n\n### One B\n\n## Two\n\n## The $x^2$ law\n\n## Three';

describe('table of contents panel', () => {
  let panel: TocPanel;
  let entries: TocEntry[];
  let onSelect: ReturnType<typeof vi.fn<(entry: TocEntry) => void>>;
  let onToggle: ReturnType<typeof vi.fn<(open: boolean) => void>>;
  let toggle: HTMLButtonElement;

  const items = () => [...panel.root.querySelectorAll<HTMLButtonElement>('[data-testid="toc-item"]')];
  const key = (name: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
    (document.activeElement ?? document.body).dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    document.body.replaceChildren();
    toggle = document.createElement('button');
    toggle.textContent = 'Contents';
    document.body.append(toggle);
    entries = buildToc(render(BOOK).element);
    onSelect = vi.fn<(entry: TocEntry) => void>();
    onToggle = vi.fn<(open: boolean) => void>();
    panel = renderTocPanel({ entries, onSelect, onToggle });
    document.body.append(panel.root);
    toggle.focus();
  });
  afterEach(() => panel.destroy());

  it('is closed at first, and is a labelled modal dialog with the contents as a navigation', () => {
    expect(panel.isOpen).toBe(false);
    expect(panel.root.hidden).toBe(true);
    const dialog = panel.root.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Contents');
    expect(panel.root.querySelector('nav')?.getAttribute('aria-label')).toBe('Table of contents');
  });

  it('lists every entry, nested by hierarchy, as buttons', () => {
    expect(items().map((b) => b.textContent!.slice(0, 5))).toEqual(['Book', 'One', 'One A', 'One B', 'Two', 'The x', 'Three']);
    expect(items().map((b) => b.dataset.depth)).toEqual(['0', '1', '2', '2', '1', '1', '1']);
    const one = items()[1].closest('li')!;
    expect([...one.querySelectorAll(':scope > ol > li > button')].map((b) => b.textContent)).toEqual(['One A', 'One B']);
    expect(panel.root.querySelectorAll('ol')).toHaveLength(3); // the root list, the one in Book, the one in One
    for (const button of items()) expect(button.type).toBe('button');
  });

  it('shows formulas rendered, without TeX', () => {
    const formula = items().find((b) => b.querySelector('.katex'))!;
    expect(formula).toBeDefined();
    expect(panel.root.textContent).not.toContain('x^2');
    expect(panel.root.querySelector('annotation')).toBeNull();
  });

  it('opens: shows itself, marks the active entry, focuses it, and tells the toggle', () => {
    panel.open('two');
    expect(panel.isOpen).toBe(true);
    expect(panel.root.hidden).toBe(false);
    const current = panel.root.querySelectorAll('[aria-current]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe('Two');
    expect(current[0].getAttribute('aria-current')).toBe('location');
    expect(document.activeElement).toBe(current[0]);
    expect(onToggle).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('with no active entry focuses the first one', () => {
    panel.open(null);
    expect(panel.root.querySelector('[aria-current]')).toBeNull();
    expect(document.activeElement).toBe(items()[0]);
    panel.close();
    panel.open('does-not-exist');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('the active entry follows setActive', () => {
    panel.open('book');
    panel.setActive('one-b');
    expect(panel.root.querySelector('[aria-current]')?.textContent).toBe('One B');
    panel.setActive(null);
    expect(panel.root.querySelector('[aria-current]')).toBeNull();
    panel.setActive('three');
    expect(panel.root.querySelectorAll('[aria-current]')).toHaveLength(1);
  });

  it('scrolls the active entry into view', () => {
    const scrolled: string[] = [];
    for (const b of items()) b.scrollIntoView = () => void scrolled.push(b.textContent!);
    panel.open('three');
    expect(scrolled).toEqual(['Three']);
  });

  it('Escape closes it and gives the focus back to the toggle', () => {
    panel.open('two');
    const event = key('Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(panel.isOpen).toBe(false);
    expect(panel.root.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
    expect(onToggle).toHaveBeenLastCalledWith(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('the close button closes it', () => {
    panel.open('two');
    panel.root.querySelector<HTMLButtonElement>('[data-testid="toc-close"]')!.click();
    expect(panel.isOpen).toBe(false);
    expect(document.activeElement).toBe(toggle);
    expect(panel.root.querySelector('[data-testid="toc-close"]')?.getAttribute('aria-label')).toBe('Close table of contents');
  });

  it('clicking outside the panel (the backdrop) closes it', () => {
    panel.open('two');
    panel.root.querySelector<HTMLElement>('[data-testid="toc-backdrop"]')!.click();
    expect(panel.isOpen).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('choosing an entry closes it and reports the choice', () => {
    panel.open('book');
    items()[2].click();
    expect(panel.isOpen).toBe(false);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(entries[2]);
    expect(entries[2].id).toBe('one-a');
    expect(document.activeElement).toBe(toggle);
  });

  it('keeps Tab inside the dialog, both ways', () => {
    panel.open('three');
    const focusable = [...panel.root.querySelectorAll<HTMLElement>('button')];
    focusable.at(-1)!.focus();
    key('Tab');
    expect(document.activeElement).toBe(focusable[0]); // forward from the last: back to the first
    key('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(focusable.at(-1)); // backwards from the first: to the last
    toggle.focus(); // focus that got out
    key('Tab');
    expect(panel.root.contains(document.activeElement)).toBe(true);
  });

  it('other keys are left alone', () => {
    panel.open('one');
    expect(key('ArrowRight').defaultPrevented).toBe(false);
    expect(key('a').defaultPrevented).toBe(false);
    expect(panel.isOpen).toBe(true);
  });

  it('after closing, Escape does nothing and the key handler is gone', () => {
    panel.open('one');
    panel.close();
    toggle.focus();
    expect(key('Escape').defaultPrevented).toBe(false);
  });

  it('opening twice or closing twice is harmless', () => {
    panel.open('one');
    panel.open('two');
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(panel.root.querySelector('[aria-current]')?.textContent).toBe('One');
    panel.close();
    panel.close();
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('can be opened again after closing, with the current entry', () => {
    panel.open('one');
    panel.close();
    panel.open('three');
    expect(panel.root.querySelector('[aria-current]')?.textContent).toBe('Three');
    expect(document.activeElement?.textContent).toBe('Three');
  });

  it('does not take any room: it is an overlay (position is set by the stylesheet) and starts hidden', () => {
    expect(panel.root.className).toBe('toc');
    expect(panel.root.hasAttribute('hidden')).toBe(true);
  });
});
