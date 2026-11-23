/**
 * The "Copy" button of code blocks. The buttons are added after the Markdown has been sanitized
 * (sanitizing removes buttons), and sit inside the `<pre>` as its last child; what is copied is the
 * text of the `<code>` element, so the button's own label is never part of it.
 */

export const COPY_CLASS = 'code-copy';
const LABEL = { idle: 'Copy', done: 'Copied', failed: 'Copy failed' } as const;
/** How long the confirmation stays. (Feedback for the reader, not a wait for layout.) */
const FEEDBACK_MS = 1600;

/** Adds a Copy button to every code block under `root`. */
export function addCopyButtons(root: ParentNode): void {
  for (const pre of root.querySelectorAll('pre')) {
    if (!pre.querySelector(':scope > code') || pre.querySelector(`:scope > .${COPY_CLASS}`)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = COPY_CLASS;
    button.textContent = LABEL.idle;
    button.setAttribute('aria-label', 'Copy code');
    pre.append(button);
  }
}

/** The code of a block as the author wrote it (one trailing newline, added by the fence, is dropped). */
export function codeOf(pre: Element): string {
  return (pre.querySelector(':scope > code')?.textContent ?? '').replace(/\n$/, '');
}

/** Copies text to the clipboard. Returns false (and never throws) when that is not possible. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // denied, or not a secure context: try the old way
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.append(field);
    field.select();
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

/** One listener for all the buttons of a book (copies of pages, which have no listener, stay inert). */
export function listenForCopyClicks(root: HTMLElement, copy: (text: string) => Promise<boolean> = copyText): void {
  const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

  root.addEventListener('click', async (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>(`.${COPY_CLASS}`);
    const pre = button?.closest('pre');
    if (!button || !pre || !root.contains(button)) return;

    const ok = await copy(codeOf(pre));
    button.textContent = ok ? LABEL.done : LABEL.failed;
    button.dataset.state = ok ? 'done' : 'failed';
    clearTimeout(timers.get(button));
    timers.set(
      button,
      setTimeout(() => {
        button.textContent = LABEL.idle;
        delete button.dataset.state;
      }, FEEDBACK_MS),
    );
  });
}
