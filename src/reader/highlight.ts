import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import type { MarkdownPlugin } from './markdown';

/**
 * Only the languages Folium needs are bundled (not all ~190 of highlight.js). `html` is `xml`
 * in highlight.js; `py`, `js`, `ts`, `c++`, `sh`, `yml`, `md`… are aliases of these.
 */
const LANGUAGES = { bash, c, cpp, css, java, javascript, json, markdown, python, sql, typescript, xml, yaml };
for (const [name, definition] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, definition);
hljs.registerAliases(['shell', 'console'], { languageName: 'bash' });

export const SUPPORTED_LANGUAGES: readonly string[] = Object.keys(LANGUAGES);

/**
 * Highlighted HTML for `code` written in `language` (the info string of a fence: "python",
 * "c++ {1,3}", "JS"…), or '' when the language is missing or unknown (the block is then
 * shown as plain text). The text of the result is exactly `code`: highlighting only adds <span>s,
 * and everything else is escaped by highlight.js.
 */
export function highlightCode(code: string, language: string): string {
  const name = language.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (name === '' || !hljs.getLanguage(name)) return '';
  try {
    return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
  } catch {
    return ''; // never let a highlighting problem stop a book from opening
  }
}

/** markdown-it: fenced code blocks are highlighted by `highlightCode`. */
export const highlightPlugin: MarkdownPlugin = (md) => {
  md.set({ highlight: highlightCode });
};
