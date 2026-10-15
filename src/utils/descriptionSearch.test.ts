import test from 'node:test';
import assert from 'node:assert/strict';
import { descriptionNamedTitle, descriptionText, parseDescriptionQuery, rankDescriptionMovies } from './descriptionSearch';
import { createDescriptionSearch } from '../../server/descriptionSearchService';

const films = [
  { id: 'goat', title: 'GOAT', category: 'animation', tags: ['animation'], description: 'ئەم فیلمە زۆر پێکەنیناوییە و چیرۆکی یارییەکی وەرزشییە', year: '2026' },
  { id: 'haunted', title: 'The Haunted House', category: 'Horror', tags: ['horror'], description: 'خێزانێک لە ماڵێکی چۆڵدا جنۆکە و شەیتان دەبینن', year: '2026', language: 'English' },
  { id: 'ghost', title: 'Possessed', category: 'action', tags: [], description: 'چیرۆکی ماڵێکی ترسناک و جنۆکەیە', year: '2025' },
  { id: 'fall', title: 'Fall | کەوتن', category: 'thriller', description: 'Two women are trapped on a high tower and fight for survival.', year: '2022' },
  { id: 'mars', title: 'Red Planet', category: 'sci-fi', description: 'An astronaut stranded in space must survive on Mars.', year: '2020', language: 'English' },
  { id: 'school', title: 'School Days', category: 'comedy', description: 'A funny story about students and their school.', year: '2020' },
];

test('Sorani taste request returns horror, never films sharing زۆر/دەوێت', () => {
  assert.deepEqual(rankDescriptionMovies(films, 'فلیمێکی زۆر ترسناکم دەوێت').map(film => film.id), ['haunted']);
  assert.deepEqual(rankDescriptionMovies([films[0], films[2]], 'ترسناک').map(film => film.id), ['ghost']);
  assert.equal(descriptionNamedTitle('فیلمێکی زۆر ترسناکم دەوێت'), null);
  assert.equal(parseDescriptionQuery('فیلمێکی زۆر ترسناکم دەوێت').tokens.length, 0);
});
test('year, language, exclusions and spelling normalization are real constraints', () => {
  assert.deepEqual(rankDescriptionMovies(films, 'فیلمی ترسناک ساڵی ٢٠٢٦').map(film => film.id), ['haunted']);
  assert.deepEqual(rankDescriptionMovies(films, 'horror movies in English 2026').map(film => film.id), ['haunted']);
  assert.deepEqual(rankDescriptionMovies(films, 'comedy without horror').map(film => film.id), ['school']);
  assert.ok(rankDescriptionMovies(films, 'no horror').every(film => !['haunted', 'ghost'].includes(film.id)));
  assert.equal(descriptionText('كوردی ۲۰۲۶'), 'کوردی 2026');
});
test('plot concepts work across Sorani and English, not just literal whole sentences', () => {
  assert.equal(rankDescriptionMovies(films, 'کەسێک لە بڕجێکی بەرزدا گیرماوە')[0]?.id, 'fall');
  assert.equal(rankDescriptionMovies(films, 'فیلمێک دەربارەی فەزا و ڕزگاربوون')[0]?.id, 'mars');
  assert.equal(rankDescriptionMovies(films, 'An astronaut stranded in space')[0]?.id, 'mars');
});
test('unknown plot and filler-only queries cannot fabricate recommendations', () => {
  assert.deepEqual(rankDescriptionMovies(films, 'فیلمێکی زۆر دەوێت'), []);
  assert.deepEqual(rankDescriptionMovies(films, 'horror movies about elephants'), []);
  assert.deepEqual(rankDescriptionMovies(films, 'underwater volcano expedition'), []);
});
test('OR genres, edited catalog and full pasted descriptions stay grounded', () => {
  const result = rankDescriptionMovies(films, 'horror or comedy');
  assert.ok(result.some(film => film.id === 'haunted'));
  assert.ok(result.some(film => film.id === 'school'));
  assert.equal(rankDescriptionMovies(films, films[3].description)[0]?.id, 'fall');
  const added = { id: 'fresh', title: 'Fresh Horror', category: 'Horror', year: '2027' };
  assert.equal(rankDescriptionMovies([...films, added], 'horror 2027')[0]?.id, 'fresh');
});
test('named requests keep exact-title/no-match behavior; source order is unchanged', () => {
  const before = films.map(film => film.id);
  assert.equal(descriptionNamedTitle('فیلمی Fall دەوێت'), 'Fall');
  assert.equal(rankDescriptionMovies(films, 'فیلمی Fall دەوێت')[0]?.id, 'fall');
  assert.deepEqual(rankDescriptionMovies(films, 'فیلمی Fall2 دەوێت'), []);
  assert.deepEqual(films.map(film => film.id), before);
});
test('no-key and provider outage return useful local results without guessed AI output', async () => {
  const local = await createDescriptionSearch({})(films, 'ترسناکم دەوێت');
  assert.equal(local.ai, false);
  assert.deepEqual(local.results.map(film => film.id), ['haunted']);
  let calls = 0;
  const search = createDescriptionSearch({ apiKey: 'test', fetch: (async () => { calls++; return new Response('', { status: 429 }); }) as typeof fetch });
  const failed = await search(films, 'astronaut stranded in space');
  assert.equal(failed.engine, 'catalog');
  assert.equal(failed.results[0]?.id, 'mars');
  await search(films, 'tower survival');
  assert.equal(calls, 1, 'cooldown avoids repeatedly consuming an exhausted provider');
});
test('optional model sees actual metadata; invented, duplicate and wrong-genre IDs are rejected', async () => {
  const search = createDescriptionSearch({ apiKey: 'test', fetch: (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const prompt = body.contents[0].parts[0].text;
    assert.match(prompt, /CATALOG=/);
    assert.match(prompt, /The Haunted House/);
    assert.match(prompt, /2026/);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ matches: [
      { id: 'invented', confidence: 1 }, { id: 'goat', confidence: 0.99 },
      { id: 'haunted', confidence: 0.95 }, { id: 'haunted', confidence: 0.9 },
    ] }) }] } }] });
  }) as typeof fetch });
  const result = await search(films, 'horror in a deserted house');
  assert.equal(result.engine, 'gemini');
  assert.deepEqual(result.results.map(film => film.id), ['haunted']);
});
