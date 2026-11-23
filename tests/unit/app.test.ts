// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountApp, renderRoute } from '../../src/app';
import { createLibrary } from '../../src/library';
import { scanFixture } from './helpers';

const library = createLibrary(scanFixture().manifest);
const noAssets = () => undefined;

describe('renderRoute', () => {
  it('picks the right view for each kind of route', () => {
    expect(renderRoute('#/', library, noAssets).element.classList.contains('page--home')).toBe(true);
    expect(renderRoute('', library, noAssets).title).toBe('Fixture Library');
    expect(renderRoute('#/category/languages/russian/a1', library, noAssets).title).toBe('A1 · Fixture Library');
    expect(renderRoute('#/book/languages/russian/a1/alphabet', library, noAssets).title).toBe(
      'Russian Alphabet · Fixture Library',
    );
  });

  it('renders the not-found page for invalid routes and unknown ids', () => {
    for (const hash of ['#/wat', '#/category/nope', '#/book/nope', '#/category/languages/russian/a1/alphabet']) {
      const page = renderRoute(hash, library, noAssets);
      expect(page.title, hash).toBe('Page not found · Fixture Library');
      expect(page.element.querySelector('[data-testid="missing-route"]')?.textContent).toBe(hash);
    }
  });
});

describe('mountApp (hash navigation)', () => {
  let container: HTMLElement;
  let unmount: () => void;

  const go = (hash: string) => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange')); // make sure the listener runs in any DOM implementation
  };
  const heading = () => container.querySelector('h1')?.textContent;

  beforeEach(() => {
    window.scrollTo = (() => {}) as typeof window.scrollTo; // jsdom does not implement it
    window.location.hash = '';
    container = document.createElement('div');
    document.body.append(container);
    unmount = mountApp(container, library, { assetUrl: noAssets });
  });

  afterEach(() => {
    unmount();
    container.remove();
  });

  it('renders the current route when mounted', () => {
    expect(heading()).toBe('Fixture Library.');
    expect(document.title).toBe('Fixture Library');
  });

  it('navigates through home → category → subcategory → book without reloading', () => {
    const before = container;
    go('#/category/languages');
    expect(heading()).toBe('Languages');
    go('#/category/languages/russian');
    expect(heading()).toBe('Russian');
    go('#/category/languages/russian/a1');
    expect(heading()).toBe('A1');
    go('#/book/languages/russian/a1/alphabet');
    expect(heading()).toBe('Russian Alphabet');
    expect(document.title).toBe('Russian Alphabet · Fixture Library');
    expect(container).toBe(before);
  });

  it('shows the not-found page for an invalid route, and recovers on a valid one', () => {
    go('#/nothing/here');
    expect(heading()).toBe('Page not found');
    go('#/');
    expect(heading()).toBe('Fixture Library.');
  });

  it('stops rendering after unmount', () => {
    unmount();
    go('#/category/languages');
    expect(heading()).toBe('Fixture Library.');
    unmount = mountApp(container, library, { assetUrl: noAssets });
  });
});
