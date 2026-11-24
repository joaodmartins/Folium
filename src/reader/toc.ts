/**
 * The table of contents: the H1–H3 headings of the rendered book, in order, with their depth.
 * Built from the finished DOM, so headings with formulas keep their rendered maths (not the TeX).
 */

export interface TocEntry {
  /** Id of the heading element in the book (unique: see headings.ts). */
  id: string;
  level: 1 | 2 | 3;
  /** Nesting depth: 0 for the top level. A heading that skips a level (an H3 right after an H1) is one level in. */
  depth: number;
  /** What to show: the heading's content (text, emphasis, rendered formulas), without ids, links or TeX source. */
  label: DocumentFragment;
  /** The visible text of the label, for tests and for announcing the entry. */
  text: string;
}

export interface TocNode {
  entry: TocEntry;
  children: TocNode[];
}

const MAX_LEVEL = 3;

/** A copy of what a heading shows, safe to put in the panel. */
function copyLabel(heading: Element): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const child of heading.childNodes) fragment.append(child.cloneNode(true));
  const holder = document.createElement('div');
  holder.append(fragment);
  // No TeX source (the MathML keeps its meaning without it), no ids, no links or buttons inside a button.
  for (const node of holder.querySelectorAll('annotation')) node.remove();
  for (const node of holder.querySelectorAll('[id]')) node.removeAttribute('id');
  for (const node of holder.querySelectorAll('a')) node.replaceWith(...node.childNodes);
  for (const node of holder.querySelectorAll('button, [tabindex]')) node.removeAttribute('tabindex');
  const out = document.createDocumentFragment();
  out.append(...holder.childNodes);
  return out;
}

function visibleText(label: DocumentFragment): string {
  const holder = document.createElement('div');
  holder.append(label.cloneNode(true));
  for (const node of holder.querySelectorAll('.katex-mathml')) node.remove(); // (that part is not drawn)
  return (holder.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Entries for the H1–H3 headings under `root` that have an id and something to show. */
export function buildToc(root: ParentNode): TocEntry[] {
  const entries: TocEntry[] = [];
  const open: number[] = []; // levels of the headings that are still "open" (ancestors of the next one)

  for (const heading of root.querySelectorAll<HTMLElement>('h1, h2, h3')) {
    const level = Number(heading.tagName[1]) as TocEntry['level'];
    if (level > MAX_LEVEL || heading.id === '') continue;
    const label = copyLabel(heading);
    const text = visibleText(label);
    if (text === '') continue; // an empty heading has nothing to list

    while (open.length > 0 && open[open.length - 1] >= level) open.pop();
    entries.push({ id: heading.id, level, depth: open.length, label, text });
    open.push(level);
  }
  return entries;
}

/** The entries as a tree (a section and what is inside it). */
export function toTree(entries: readonly TocEntry[]): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];
  for (const entry of entries) {
    const node: TocNode = { entry, children: [] };
    stack.length = entry.depth; // the parents of this entry are the first `depth` open nodes
    (stack[entry.depth - 1]?.children ?? roots).push(node);
    stack.push(node);
  }
  return roots;
}
