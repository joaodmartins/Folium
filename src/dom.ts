export type Child = Node | string | null | undefined | false;

/**
 * Tiny element builder. Text is always inserted as text nodes (never parsed as HTML),
 * so titles and descriptions coming from Markdown files cannot inject markup.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined) node.setAttribute(name, value);
  }
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
