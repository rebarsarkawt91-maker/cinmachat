import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogHasNamedTitle, discoverTitleMatches, namedSearchTitle, rankNamedMovies } from './externalTitle';

const catalog = [
  { id: 'dm4', title: '🎬 Despicable Me 4 | منی نەفرەتلێکراو', year: '2024' },
  { id: 'dm2', title: 'Despicable Me 2', year: '2013' },
  { id: 'soul', title: 'Soul', year: '2020' },
  { id: 'other', title: 'Other movie', description: 'Despicable Me 4 is mentioned in a plot' },
];
test('short and unfinished names find real catalog titles, never plot-only matches', () => {
  for (const query of ['Despicable', 'Despicable Me', 'Despi', 'despicable me4', 'فیلمی Despicable دەوێت']) {
    const ids = rankNamedMovies(catalog, query).map(f => f.id);
    assert.ok(ids.includes('dm4'), query);
    assert.ok(!ids.includes('other'), query);
  }
  assert.deepEqual(rankNamedMovies(catalog, 'Despicable Me 4').map(f => f.id), ['dm4']);
  assert.equal(namedSearchTitle(catalog[0].title, catalog), 'despicable me 4');
  assert.deepEqual(rankNamedMovies(catalog, catalog[0].title).map(f => f.id), ['dm4'], 'selecting a bilingual display title does not become a description search');
  assert.deepEqual(rankNamedMovies(catalog, 'Despicable Me 3'), []);
  assert.deepEqual(rankNamedMovies(catalog, 'Despicable Me 2026'), []);
  assert.deepEqual(rankNamedMovies(catalog, 'فیلمێکی ترسناکم دەوێت'), []);
  assert.deepEqual(rankNamedMovies(catalog, 'فیلمێک باسی ڕۆح بکات'), []);
  assert.deepEqual(rankNamedMovies(catalog, ''), []);
});
test('screenshot Kurdish meanings, spacing, joined letters and Unicode parts resolve to English', () => {
  for (const query of ['منی نەفرەت‌لێکراو ٤', 'منی نەفرەت لێکراو ۴', 'نەفرەتلێکراو 4', 'فیلمی منی نەفرەتلێکراو ٤ دەوێت']) {
    assert.equal(namedSearchTitle(query, catalog), 'despicable me 4', query);
    assert.deepEqual(rankNamedMovies(catalog, query).map(f => f.id), ['dm4'], query);
  }
  for (const query of ['نەفرەتلێکراو', 'منی نەفرەتلێکراو']) {
    assert.deepEqual(rankNamedMovies(catalog, query).map(f => f.id).sort(), ['dm2', 'dm4']);
  }
  assert.deepEqual(rankNamedMovies(catalog, 'رۆح').map(f => f.id), ['soul']);
  assert.deepEqual(rankNamedMovies(catalog, 'ڕۆح ٢٠٢٦'), []);
});
test('partial discovery remains honest about exact availability and external playback', () => {
  const result = discoverTitleMatches(catalog, 'Despicable', { results: [{ imdbId: 'tt7510222', title: 'Despicable Me 4',
    year: 2024, poster: '', kind: 'movie', imdbUrl: 'https://www.imdb.com/title/tt7510222/' }] });
  assert.equal(result.alreadyAvailable, false);
  assert.equal(result.local?.length, 2);
  assert.equal(result.results[0].relation, 'partial');
  assert.equal(result.results[0].availableId, 'dm4');
  assert.equal(catalogHasNamedTitle(catalog, 'Despicable'), false);
  assert.equal(catalogHasNamedTitle(catalog, 'نەفرەتلێکراو ٤'), true);
  assert.equal('videoUrl' in result.results[0], false);
});
test('bilingual catalog names extend matching without hard-coded English movie lists', () => {
  const films = [{ id: 'x', title: 'Silver Harbor | بەندەری زیوین', year: '2024' }];
  assert.equal(rankNamedMovies(films, 'بەندەری')[0]?.id, 'x');
  assert.equal(rankNamedMovies(films, 'Silver Har')[0]?.id, 'x');
  assert.deepEqual(rankNamedMovies(films, 'Silvery Harbor'), []);
  assert.deepEqual(rankNamedMovies([...catalog, catalog[0]], 'Despicable').map(f => f.id).sort(), ['dm2', 'dm4']);
});
