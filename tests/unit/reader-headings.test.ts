// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { assignHeadingIds } from '../../src/reader/headings';
import { render } from './reader-helpers';

const headingsOf = (md: string) => render(md).headings;

describe('heading extraction', () => {
  it('lists headings in order with level, text and id', () => {
    expect(headingsOf('# Title\n\ntext\n\n## Overview\n\n### Details\n\n## Study tips')).toEqual([
      { level: 1, text: 'Title', id: 'title' },
      { level: 2, text: 'Overview', id: 'overview' },
      { level: 3, text: 'Details', id: 'details' },
      { level: 2, text: 'Study tips', id: 'study-tips' },
    ]);
  });

  it('sets the id on the heading elements, so anchors can target them', () => {
    const { element } = render('## Overview\n\ntext');
    expect(element.querySelector('h2')?.id).toBe('overview');
  });

  it('uses the visible text of headings with inline formatting', () => {
    expect(headingsOf('## The `fork()` call & **processes**')[0]).toMatchObject({
      text: 'The fork() call & processes',
      id: 'the-fork-call-processes',
    });
  });

  it('generates unique ids for repeated headings', () => {
    expect(headingsOf('## Exercises\n\n## Exercises\n\n## Exercises').map((h) => h.id)).toEqual([
      'exercises',
      'exercises-1',
      'exercises-2',
    ]);
  });

  it('keeps ids unique even when a heading looks like a generated id', () => {
    const ids = headingsOf('## Intro\n\n## Intro\n\n## Intro 1\n\n## Intro 1').map((h) => h.id);
    expect(ids).toEqual(['intro', 'intro-1', 'intro-1-1', 'intro-1-2']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('handles accents, non-Latin scripts and empty headings', () => {
    expect(headingsOf('## Visão geral\n\n## Алфавит\n\n## !!!\n\n## !!!').map((h) => h.id)).toEqual([
      'visao-geral',
      'алфавит',
      'untitled',
      'untitled-1',
    ]);
  });

  it('finds headings inside lists and blockquotes, and in raw HTML', () => {
    expect(headingsOf('> ## Quoted\n\n<h3>Raw</h3>').map((h) => `${h.level}:${h.text}`)).toEqual(['2:Quoted', '3:Raw']);
  });

  it('works on any DOM tree and returns nothing when there are no headings', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>no headings</p>';
    expect(assignHeadingIds(root)).toEqual([]);
  });

  it('ignores ids written by the author (they are removed and replaced)', () => {
    const { element } = render('<h2 id="custom">Heading</h2>');
    expect(element.querySelector('h2')?.id).toBe('heading');
  });
});
