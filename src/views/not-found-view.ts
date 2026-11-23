import { el } from '../dom';
import { hashFor } from '../router';
import type { Page, ViewContext } from './types';

export function renderNotFoundView({ library }: ViewContext, hash: string): Page {
  const element = el(
    'main',
    { class: 'page page--centered', id: 'main' },
    el('h1', { class: 'page__title', tabindex: '-1' }, 'Page not found'),
    el('p', { class: 'page__lead' }, 'There is nothing at this address:'),
    el('p', {}, el('code', { 'data-testid': 'missing-route' }, hash || '(empty)')),
    el('a', { class: 'button', href: hashFor({ name: 'home' }) }, `Back to ${library.title}`),
  );
  return { title: `Page not found · ${library.title}`, element };
}
