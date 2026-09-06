import test from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentRoomRequest, mapRoomTranslations, normalizeSorani, parseRoomSubtitleCues, priorityBatch, reflowRoomTranslation, roomCacheIdentity, validateRoomBatch } from '../../src/lib/roomSubtitleCore';

const source = `WEBVTT

opening
00:00:01.250 --> 00:00:04.900 align:start position:10%
<i>Ahmed, visit https://example.com/ك.</i>
Bring 20 tickets.

later
00:07:02.500 --> 00:07:05.125
Where are the keys?

ending
01:42:01.000 --> 01:42:07.050
We are going home.
`;

test('VTT and SRT retain full-film timestamps, IDs, settings and line associations', () => {
  const cues = parseRoomSubtitleCues(source);
  assert.equal(cues.length, 3);
  assert.equal(cues[2].end, 6127.05);
  const translated = mapRoomTranslations(cues, new Map([[0, 'ئەحمەد\n20 بلیت.'], [2, 'بۆ ماڵەوە.']]));
  assert.deepEqual(translated.map(({text, ...metadata}) => metadata), [cues[0], cues[2]].map(({text, ...metadata}) => metadata));
  assert.equal(cues[0].id, 'opening');
  assert.match(cues[0].timing, /align:start position:10%/);
  assert.equal(cues[0].rawLines.length, 2);
  const srt = parseRoomSubtitleCues('45\n00:10:02,125 --> 00:10:07,200\nDialogue\n');
  assert.deepEqual([srt[0].id, srt[0].start, srt[0].end], ['45', 602.125, 607.2]);
});

test('seeks reprioritize missing cues and progressive batches eventually cover every cue', () => {
  const cues = Array.from({length: 1500}, (_, index) => ({...parseRoomSubtitleCues(source)[0], index, id: String(index), start: index * 5, end: index * 5 + 4}));
  const done = new Set<number>();
  assert.equal(priorityBatch(cues, done, 6000)[0].index, 1199);
  assert.equal(priorityBatch(cues, done, 30)[0].index, 5);
  let rounds = 0;
  while (done.size < cues.length) {
    const batch = priorityBatch(cues, done, 6000);
    assert.ok(batch.length > 0 && batch.length <= 20);
    batch.forEach((cue) => { assert.ok(!done.has(cue.index)); done.add(cue.index); });
    assert.ok(++rounds <= 75);
  }
  assert.equal(done.size, 1500);
});

test('each cache identity dimension isolates source versions and language/model changes', () => {
  const values = ['video', 'content-hash', 'en', 'ckb', 'model-v1'];
  const key = roomCacheIdentity(...values as [string,string,string,string,string]);
  values.forEach((_, index) => {
    const changed = [...values]; changed[index] += '2';
    assert.notEqual(roomCacheIdentity(...changed as [string,string,string,string,string]), key);
  });
});

test('late callbacks cannot commit after language, room, generation or abort changes', () => {
  assert.equal(isCurrentRoomRequest(1,1,'roomA:ckb','roomA:ckb',false), true);
  assert.equal(isCurrentRoomRequest(1,2,'roomA:ckb','roomA:ckb',false), false);
  assert.equal(isCurrentRoomRequest(1,1,'roomA:ckb','roomA:ar-IQ',false), false);
  assert.equal(isCurrentRoomRequest(1,1,'roomA:ckb','roomB:ckb',false), false);
  assert.equal(isCurrentRoomRequest(1,1,'roomA:ckb','roomA:ckb',true), false);
});

test('Sorani script normalization preserves Kurdish letters, numbers, names and URLs', () => {
  assert.equal(normalizeSorani('كوردی يەکێک ڕڵۆێە Ahmed 123 https://x.test/يك'), 'کوردی یەکێک ڕڵۆێە Ahmed 123 https://x.test/يك');
});

test('invalid, missing, collapsed and corrupted model batches are rejected', () => {
  for (const output of [null, [], [''], ['one', 'two'], ['\uFFFD'], ['abc'.repeat(20)]]) assert.throws(() => validateRoomBatch(['source'], output));
  assert.throws(() => validateRoomBatch(['one','two','three'], ['same','same','same']));
  assert.doesNotThrow(() => validateRoomBatch(['yes','yes','yes'], ['بەڵێ','بەڵێ','بەڵێ']));
});

test('cue reflow preserves every translated word and keeps URLs intact', () => {
  const translated = 'لدي شهادة بكالوريوس وشهادة ماجستير في العمل الاجتماعي https://example.com/degree 10';
  const result = reflowRoomTranslation('I have a bachelor\'s\nand a master\'s in social work.', translated);
  assert.equal(result.split('\n').length, 2);
  assert.deepEqual(result.split(/\s+/u), translated.split(/\s+/u));
  assert.ok(result.includes('https://example.com/degree'));
  assert.equal(reflowRoomTranslation('one\ntwo\nthree', 'نعم'), 'نعم');
  assert.equal(reflowRoomTranslation('single line', 'two\nwords'), 'two words');
});

test('numeric and URL corruption is rejected across a whole wrapped cue', () => {
  assert.doesNotThrow(() => validateRoomBatch(['for 10 years\nin 2 cities'], ['لمدة ١٠ سنوات في مدينتين ٢']));
  assert.throws(() => validateRoomBatch(['for 10 years\nin 2 cities'], ['لمدة 10 سنوات']));
  assert.throws(() => validateRoomBatch(['visit https://example.com/a'], ['https://example.com/b']));
});
