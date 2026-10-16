import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX_OFFICE_FEED, BOX_OFFICE_TTL, createBoxOfficeService, parseBoxOfficeFeed } from './boxOfficeService';
import { boxOfficeSeed } from '../src/data/boxOfficeSeed';

const rows = ['Other Mommy', 'Verity', 'Resident Evil', 'Heart of the Beast', 'The Social Reckoning'];
const feed = (titles = rows) => `document.write('<tr><td colspan=2><nobr>Weekend Box Office</nobr>, <nobr>Oct 9&#150;11</nobr></td></tr>');\n` + titles.map((title, index) =>
  `document.write('<tr><td class=mojo_row>${index + 1}. ${title}</td><td class=mojo_row>$${10 - index}.0 M</td></tr>');`).join('\n');
const js = (body = feed()) => new Response(body, { headers: { 'Content-Type': 'text/javascript;charset=UTF-8' } });

test('official feed parser preserves rank, date, gross and entities without executing JavaScript', () => {
  const chart = parseBoxOfficeFeed(feed(['Mommy &amp; Me', 'Verity', 'Resident Evil', 'Heart of the Beast', "The Writer\\'s Story"]) + '\nthrow new Error("never execute");');
  assert.equal(chart.period, 'Oct 9–11');
  assert.deepEqual(chart.items.map(x => x.rank), [1, 2, 3, 4, 5]);
  assert.equal(chart.items[0].title, 'Mommy & Me');
  assert.equal(chart.items[4].title, "The Writer's Story");
  assert.equal(chart.items[0].weekendGross, '$10.0 M');
});

test('incomplete, oversized, duplicate and malformed feed charts fail closed', () => {
  for (const invalid of [feed(rows.slice(0, 4)), feed(['Same', 'Same', 'Three', 'Four', 'Five']),
    feed().replace('2. Verity', '4. Verity'), feed().replace('$10.0 M', 'javascript:alert(1)'),
    feed().replace('Weekend Box Office', 'Unrelated feed'), 'x'.repeat(128001), '<html>Challenge required</html>']) {
    assert.throws(() => parseBoxOfficeFeed(invalid));
  }
});

test('one fixed-origin refresh is shared across visitors and cached for six hours', async () => {
  let time = Date.parse('2026-10-16T19:31:58Z'), feedCalls = 0, metadataCalls = 0;
  const service = createBoxOfficeService({ now: () => time, request: (async (url, init) => {
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    if (url === BOX_OFFICE_FEED) { feedCalls++; return js(); }
    assert.equal(new URL(String(url)).hostname, 'v3.sg.media-imdb.com');
    metadataCalls++;
    const title = decodeURIComponent(new URL(String(url)).pathname.split('/').pop()!.replace(/\.json$/, ''));
    return Response.json({ d: [{ id: `tt${1000000 + metadataCalls}`, l: title, y: 2026, qid: 'movie',
      i: { imageUrl: 'https://m.media-amazon.com/images/M/test._V1_.jpg' } }] });
  }) as typeof fetch });
  const results = await Promise.all(Array.from({ length: 30 }, () => service()));
  assert.equal(feedCalls, 1); assert.equal(metadataCalls, 5);
  assert.ok(results.every(x => !x.stale && x.items.length === 5));
  assert.equal(results[0].items[0].title, 'Other Mommy');
  assert.match(results[0].items[0].poster, /UX240/);
  await service(); assert.equal(feedCalls, 1);
  time += BOX_OFFICE_TTL + 1;
  await service(); assert.equal(feedCalls, 2);
});

test('outage preserves a clearly dated last-good chart and uses a bounded retry cooldown', async () => {
  let time = Date.parse('2026-10-16T19:31:58Z'), calls = 0, fail = true;
  const service = createBoxOfficeService({ now: () => time, request: (async url => {
    calls++;
    if (fail) return new Response('', { status: 503 });
    return url === BOX_OFFICE_FEED ? js() : Response.json({ d: [] });
  }) as typeof fetch });
  const old = await service();
  assert.equal(old.stale, true);
  assert.equal(old.fetchedAt, boxOfficeSeed.fetchedAt);
  assert.deepEqual(old.items, boxOfficeSeed.items);
  await service(); assert.equal(calls, 1);
  time += 15 * 60 * 1000 + 1; fail = false;
  assert.equal((await service()).stale, false);
  assert.equal(calls, 7);
});

test('poster failures cannot erase ranks or inject arbitrary remote poster hosts', async () => {
  const service = createBoxOfficeService({ seed: { ...boxOfficeSeed, items: [] }, request: (async url => {
    if (url === BOX_OFFICE_FEED) return js();
    const title = decodeURIComponent(new URL(String(url)).pathname.split('/').pop()!.replace(/\.json$/, ''));
    return Response.json({ d: [{ id: 'tt1234567', l: title, y: 2026, qid: 'movie', i: { imageUrl: 'https://evil.test/poster.jpg' } }] });
  }) as typeof fetch });
  const result = await service();
  assert.deepEqual(result.items.map(x => x.rank), [1, 2, 3, 4, 5]);
  assert.ok(result.items.every(x => x.poster === ''));
  assert.equal(result.stale, false);
});

test('HTML challenges and oversized streamed responses retain the safe seed', async () => {
  for (const response of [new Response(feed(), { headers: { 'Content-Type': 'text/html' } }), js('x'.repeat(128001))]) {
    const service = createBoxOfficeService({ request: (async () => response) as typeof fetch });
    assert.equal((await service()).stale, true);
    assert.deepEqual((await service()).items, boxOfficeSeed.items);
  }
});
