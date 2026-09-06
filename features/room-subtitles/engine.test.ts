import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalRoomEngine, iraqiTranslationRequest, parseIraqiLines, roomModelFileFingerprint } from './engine';
import { mkdtemp, rm, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('numbered translations follow explicit cue IDs, including reordered responses', () => {
  assert.deepEqual(parseIraqiLines('2) الثاني\n1) الأول\n', 2), ['الأول', 'الثاني']);
  assert.deepEqual(parseIraqiLines('1. 2026 سنة\n2. نعم', 2), ['2026 سنة', 'نعم']);
});

test('missing, duplicate, extra and unnumbered output cannot shift dialogue between cues', () => {
  for (const raw of [
    '1) الأول\nنص بدون رقم',
    '1) الأول\n1) الثاني',
    '1) الأول\n3) الثالث',
    '1) الأول\n2) الثاني\n3) الثالث',
    '1) الأول\n2)',
    '1 الأول\n2 الثاني',
    '1) الأول\n2) الثاني\nExplanation: extra text',
  ]) assert.throws(() => parseIraqiLines(raw, 2));
});

test('visual line wraps stay in the same model item instead of losing sentence context', () => {
  const request = iraqiTranslationRequest([
    "I have a bachelor's\nand a master's in social work.",
    'I will call you\na researcher.',
  ]);
  assert.equal(request.messages[1].content, "1) I have a bachelor's and a master's in social work.\n2) I will call you a researcher.");
  assert.equal(request.seed, 42);
});

test('invalid batches fail before starting a model and leave the inference slot available', async () => {
  const engine = new LocalRoomEngine();
  for (const texts of [[], [''], ['x'.repeat(2049)], Array(51).fill('line')]) {
    await assert.rejects(engine.translate(texts, 'ar-IQ'), /Invalid translation batch/);
    assert.equal(engine.busy, false);
  }
  engine.stop();
});

test('model cache fingerprint follows actual contents and invalidates replaced weights', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'room-model-fingerprint-'));
  const filename = path.join(directory, 'weights.bin');
  try {
    await writeFile(filename, 'first model');
    const first = await roomModelFileFingerprint(filename);
    assert.equal(first, await roomModelFileFingerprint(filename));
    await writeFile(filename, 'other model'); // Same size, different contents.
    const later = new Date(Date.now() + 2000);
    await utimes(filename, later, later);
    assert.notEqual(first, await roomModelFileFingerprint(filename));
    const copy = path.join(directory, 'copy.bin');
    await writeFile(copy, 'other model');
    assert.equal(await roomModelFileFingerprint(filename), await roomModelFileFingerprint(copy));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
