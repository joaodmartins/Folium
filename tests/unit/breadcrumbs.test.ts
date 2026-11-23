// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { bookCrumbs, categoryCrumbs, renderBreadcrumbs } from '../../src/components/breadcrumbs';
import { createLibrary } from '../../src/library';
import { scanFixture } from './helpers';

const library = createLibrary(scanFixture().manifest);

describe('breadcrumbs', () => {
  it('lists every level of a deep category, the current one last without a link', () => {
    const crumbs = categoryCrumbs(library, library.getCategory('university/operating-systems/theory')!);
    expect(crumbs).toEqual([
      { label: 'Fixture Library', href: '#/' },
      { label: 'University', href: '#/category/university' },
      { label: 'Operating Systems', href: '#/category/university/operating-systems' },
      { label: 'Theory', href: undefined },
    ]);
  });

  it('handles a top-level category', () => {
    expect(categoryCrumbs(library, library.getCategory('languages')!)).toEqual([
      { label: 'Fixture Library', href: '#/' },
      { label: 'Languages', href: undefined },
    ]);
  });

  it('ends with the book title, preceded by its full category path', () => {
    const crumbs = bookCrumbs(library, library.getBook('languages/russian/a1/alphabet')!);
    expect(crumbs.map((c) => c.label)).toEqual(['Fixture Library', 'Languages', 'Russian', 'A1', 'Russian Alphabet']);
    expect(crumbs.map((c) => c.href)).toEqual([
      '#/',
      '#/category/languages',
      '#/category/languages/russian',
      '#/category/languages/russian/a1',
      undefined,
    ]);
  });

  it('handles a book at the root of the library', () => {
    const crumbs = bookCrumbs(library, library.getBook('top-level')!);
    expect(crumbs).toEqual([{ label: 'Fixture Library', href: '#/' }, { label: 'At the root' }]);
  });

  it('renders an accessible nav with links and aria-current on the last item', () => {
    const nav = renderBreadcrumbs(categoryCrumbs(library, library.getCategory('languages/russian')!));
    expect(nav.getAttribute('aria-label')).toBe('Breadcrumb');
    expect([...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['#/', '#/category/languages']);
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe('Russian');
  });
});
