import test from 'node:test';
import assert from 'node:assert/strict';
import { createExternalTitleSearch, parseImdbTitles } from './externalTitleSearch';
import { catalogHasNamedTitle, movieRequestLink, namedSearchTitle } from '../src/utils/externalTitle';

const fall = { id: 'tt15325794', l: 'Fall', y: 2022, qid: 'movie', i: { imageUrl: 'https://m.media-amazon.com/images/M/poster.jpg' } };
test('external results are real title metadata, exact names first, never actors or invented playback', () => {
  const result = parseImdbTitles({ d: [
    { ...fall, id: 'tt31192372', l: 'Fall 2: Deadpoint', y: 2026 }, fall,
    { ...fall, id: 'nm1234567', qid: 'person' }, { ...fall, id: 'tt5555555', l: 'Falling' },
    { ...fall, id: 'tt6666666', l: 'Other Film' }, fall,
  ] }, 'Fall');
  assert.deepEqual(result.map(x => x.imdbId), ['tt15325794', 'tt31192372']);
  assert.equal(result[0].imdbUrl, 'https://www.imdb.com/title/tt15325794/');
  assert.ok(result.every(x => !('videoUrl' in x) && !('source' in x)));
  assert.deepEqual(parseImdbTitles({ d: [fall] }, 'Fall 2026'), []);
  assert.deepEqual(parseImdbTitles(null, 'Fall'), []);
});
test('untrusted poster URLs are omitted and malformed records cannot become links', () => {
  for (const imageUrl of ['javascript:alert(1)', 'http://localhost/private', 'https://m.media-amazon.com.evil.test/images/a.jpg']) {
    assert.equal(parseImdbTitles({ d: [{ ...fall, i: { imageUrl } }] }, 'Fall')[0].poster, '');
  }
  assert.deepEqual(parseImdbTitles({ d: [{ ...fall, id: 'https://evil.test' }] }, 'Fall'), []);
});
test('only named requests use external lookup, while plot/genre requests keep semantic matching', () => {
  assert.equal(namedSearchTitle('Fall'), 'Fall');
  assert.equal(namedSearchTitle('Anna Pigeon'), 'Anna Pigeon');
  assert.equal(namedSearchTitle('فیلمی Fall دەوێت'), 'Fall');
  for (const q of ['فیلمێکم دەوێت باسی ڕاپەڕین بکات', 'فیلمێکی ترسناکم دەوێت', 'space survival', 'a movie about freedom']) assert.equal(namedSearchTitle(q), null);
  assert.equal(catalogHasNamedTitle([{ id: 'x', title: 'Fallen' }], 'Fall'), false);
  assert.equal(catalogHasNamedTitle([{ id: 'x', title: 'Fall 2' }], 'Fall2'), false);
  assert.equal(catalogHasNamedTitle([{ id: 'x', title: 'Fall | کەوتن (٢٠٢٢)', year: '2022' }], 'Fall 2022'), true);
});
test('WhatsApp requests preserve group invitations and safely prefill direct chat links', () => {
  const film = parseImdbTitles({ d: [fall] }, 'Fall')[0];
  const group = 'https://chat.whatsapp.com/example-invite';
  assert.equal(movieRequestLink(group, film), group);
  const direct = new URL(movieRequestLink('https://wa.me/12345?text=old', film));
  assert.match(direct.searchParams.get('text') || '', /Fall \(2022\)/);
  assert.match(direct.searchParams.get('text') || '', /tt15325794/);
  assert.equal(movieRequestLink('javascript:alert(1)', film), '');
  assert.equal(movieRequestLink('https://evil.test', film), '');
});
test('cache shares concurrent requests, limits network origin and returns honest failures', async () => {
  let calls = 0;
  const lookup = createExternalTitleSearch((async (url, init) => {
    calls++;
    assert.equal(new URL(String(url)).hostname, 'v3.sg.media-imdb.com');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    return Response.json({ d: [fall] });
  }) as typeof fetch);
  const results = await Promise.all([lookup('Fall'), lookup('fall'), lookup('Fall')]);
  assert.equal(calls, 1);
  assert.ok(results.every(x => x.results[0]?.title === 'Fall'));
  assert.equal((await lookup('Fall')).results[0].year, 2022);
  assert.equal(calls, 1);
  const failed = await createExternalTitleSearch((async () => new Response('', { status: 503 })) as typeof fetch)('Fall');
  assert.equal(failed.unavailable, true);
  assert.deepEqual(failed.results, []);
});
test('oversized or HTML upstream responses fail closed without fake cards', async () => {
  const huge = createExternalTitleSearch((async () => new Response('x'.repeat(512001), { headers: { 'Content-Type': 'application/json' } })) as typeof fetch);
  assert.equal((await huge('Fall')).unavailable, true);
  const html = createExternalTitleSearch((async () => new Response('<script>bad</script>', { headers: { 'Content-Type': 'text/html' } })) as typeof fetch);
  assert.equal((await html('Fall')).unavailable, true);
});
