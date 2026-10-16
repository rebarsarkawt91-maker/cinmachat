import test from 'node:test';
import assert from 'node:assert/strict';
import { livePreviewWindow, topLivePreviewIds, wrapPreviewIndex } from './liveMoviePreview';

test('up to two genuine concurrent leaders qualify; totals and promo cards never qualify', () => {
  const films = [{ id: 'old', live: 0, views: 99999 }, { id: 'a', live: 3, views: 0 },
    { id: 'b', live: 12, views: 1 }, { id: 'c', live: 2, views: 800 }, { id: 'hero-promo', live: 100, views: 10 }];
  assert.deepEqual(topLivePreviewIds(films, film => film.live), ['b', 'a']);
  assert.deepEqual(topLivePreviewIds(films.slice(0, 2), film => film.live), ['a']);
  assert.deepEqual(topLivePreviewIds([films[0]], film => film.live), []);
});
test('ties are stable, duplicates and invalid counts cannot create extra pins', () => {
  const films = [{ id: 'a', n: 2 }, { id: 'a', n: 20 }, { id: 'b', n: 2 }, { id: 'c', n: 2 },
    { id: 'bad', n: Infinity }, { id: 'nan', n: NaN }, { id: 'negative', n: -4 }];
  const before = structuredClone(films);
  assert.deepEqual(topLivePreviewIds(films, film => film.n), ['a', 'b']);
  assert.deepEqual(films, before);
  assert.deepEqual(topLivePreviewIds([], () => 100), []);
});
test('live rank responds to starts/stops, retaining normal eligible catalog scope', () => {
  const films = [{ id: 'a', n: 1 }, { id: 'b', n: 0 }, { id: 'c', n: 0 }];
  assert.deepEqual(topLivePreviewIds(films, film => film.n), ['a']);
  const next = films.map(film => ({ ...film, n: film.id === 'b' ? 4 : 0 }));
  assert.deepEqual(topLivePreviewIds(next, film => film.n), ['b']);
  assert.deepEqual(topLivePreviewIds(next.filter(film => film.id !== 'b'), film => film.n), []);
});
test('single-card windows wrap rightward with no clones, missing records or large DOM pools', () => {
  const films = Array.from({ length: 170 }, (_, id) => ({ id: String(id) }));
  let head = 0; const seen = new Set<string>();
  for (let step = 0; step < films.length; step++) {
    const window = livePreviewWindow(films, head, 8);
    assert.equal(window.length, 8);
    assert.equal(new Set(window.map(film => film.id)).size, 8);
    window.forEach(film => seen.add(film.id));
    head = wrapPreviewIndex(head - 1, films.length);
  }
  assert.equal(seen.size, 170);
  assert.deepEqual(livePreviewWindow(films.slice(0, 1), -1, 8), [films[0]]);
  assert.deepEqual(livePreviewWindow([], 1, 8), []);
  assert.equal(wrapPreviewIndex(-1, 170), 169);
});
