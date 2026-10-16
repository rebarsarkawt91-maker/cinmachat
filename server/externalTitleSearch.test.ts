import test from 'node:test';
import assert from 'node:assert/strict';
import { createExternalTitleSearch, parseImdbTitles } from './externalTitleSearch';
import { catalogHasNamedTitle, discoverTitleMatches, movieRequestLink, namedSearchTitle, titleIdentity } from '../src/utils/externalTitle';

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
  assert.equal(catalogHasNamedTitle([{ id: 'x', title: 'Fall 2' }], 'Fall2'), true);
  assert.equal(catalogHasNamedTitle([{ id: 'x', title: 'Fall | کەوتن (٢٠٢٢)', year: '2022' }], 'Fall 2022'), true);
});

test('the exact screenshot request and Sorani/Arabic wish variants extract the real title', () => {
  for (const query of ['فیلمی Anna Pigeon ئەمەوێ', 'فیلمى Anna Pigeon ئەمەوێ', 'فيلمى Anna Pigeon دەمەوێت',
    'تکایە فیلمی Anna Pigeon ئەموێ', 'دەمەوێت فیلمی Anna Pigeon', 'Anna Pigeon ئەمەوێ', 'I want movie Anna Pigeon']) {
    assert.equal(namedSearchTitle(query), 'Anna Pigeon', query);
  }
  assert.equal(namedSearchTitle('فیلمێکم ئەمەوێ باسی ڕاپەڕین بکات'), null);
  assert.equal(namedSearchTitle('rebels fighting a king'), null);
});

test('numbered parts, glued numbers, Roman numerals and Unicode years are separate constraints', () => {
  for (const title of ['Fall2', 'Fall 2', 'Fall II', 'Fall بەشی دووەم', 'Fall بەشى ٢', 'Fall part two']) {
    assert.equal(titleIdentity(title).base, 'fall');
    assert.equal(titleIdentity(title).part, 2, title);
  }
  assert.equal(titleIdentity('Fall (٢٠٢٢)').year, 2022);
  assert.equal(titleIdentity('Moana ساڵی ٢٠١٦').base, 'moana');
  assert.equal(titleIdentity('Moana ساڵی ٢٠١٦').year, 2016);
  assert.equal(titleIdentity('Fall 2: Deadpoint (2026)').part, 2);
  assert.equal(titleIdentity('John Wick: Chapter 4', 2023).base, 'john wick');
  assert.equal(titleIdentity('John Wick: Chapter 4', 2023).part, 4);
  const catalog = [{ id: 'first', title: 'Fall | کەوتن', year: '2022' }];
  assert.equal(catalogHasNamedTitle(catalog, 'Fall 2022'), true);
  assert.equal(catalogHasNamedTitle(catalog, 'Fall 2026'), false);
  assert.equal(catalogHasNamedTitle(catalog, 'Fall2'), false);
  assert.equal(catalogHasNamedTitle([{ id: 'moana', title: 'Moana (2026) مۆوانە |کورد سینەما چات', year: '2026' }], 'Moana 2026'), true);
  assert.equal(catalogHasNamedTitle([{ id: 'avatar', title: 'AVATAR Full Movie', year: '2026' }], 'Avatar 2026'), true);
  assert.notEqual(titleIdentity('Spider-Man: No Way Home').base, titleIdentity('Spider-Man: Homecoming').base);
  assert.equal(titleIdentity('2001: A Space Odyssey', 1968).base, '2001 a space odyssey');
  assert.equal(titleIdentity('1917', 2019).base, '1917');
});

test('local first film does not suppress other IMDb parts or same-name years', () => {
  const original = parseImdbTitles({ d: [fall] }, 'Fall')[0];
  const second = { ...original, imdbId: 'tt31192372', title: 'Fall 2: Deadpoint', year: 2026 };
  // Fictional same-name year used solely to test comparison, not a release claim.
  const otherYear = { ...original, imdbId: 'tt12345678', year: 2026 };
  const catalog = [{ id: 'first', title: 'Fall | کەوتن', year: '2022' }];
  const search = discoverTitleMatches(catalog, 'Fall 2022', { results: [second, otherYear, original] });
  assert.equal(search.alreadyAvailable, true);
  assert.equal(search.results.find(f => f.imdbId === original.imdbId)?.availableId, 'first');
  assert.equal(search.results.find(f => f.imdbId === second.imdbId)?.relation, 'numbered');
  assert.equal(search.results.find(f => f.imdbId === otherYear.imdbId)?.relation, 'different-year');
  const missingPart = discoverTitleMatches(catalog, 'Fall 2', { results: [original, second] });
  assert.equal(missingPart.alreadyAvailable, false);
  assert.equal(missingPart.results[0].imdbId, second.imdbId);
  assert.equal(missingPart.local?.[0].id, 'first');
  assert.equal(missingPart.local?.[0].relation, 'numbered');
  assert.equal(missingPart.requestedPart, 2);
  assert.equal(discoverTitleMatches(catalog, 'Fall', { results: [{ ...original, title: 'Anatomy of a Fall' }] }).results.length, 0);
});

test('part/year searches query the base too and reuse cached provider metadata', async () => {
  const queries: string[] = [];
  const lookup = createExternalTitleSearch((async url => {
    queries.push(decodeURIComponent(new URL(String(url)).pathname));
    return Response.json({ d: [fall, { ...fall, id: 'tt31192372', l: 'Fall 2: Deadpoint', y: 2026 }] });
  }) as typeof fetch);
  assert.equal((await lookup('Fall 2022')).results.length, 2);
  assert.equal((await lookup('Fall 2026')).results.length, 2);
  assert.equal(queries.length, 1, 'years share the base-title cache');
  assert.equal((await lookup('Fall بەشی دووەم')).results.length, 2);
  assert.equal(queries.length, 2, 'at most one additional numbered-title query');
  assert.ok(queries.some(query => query.endsWith('/fall.json')));
  assert.ok(queries.some(query => query.endsWith('/fall 2.json')));
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
