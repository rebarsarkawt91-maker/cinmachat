import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSubtitleContent } from './parser';
import { exportSubtitles } from './exporter';

test('parses SRT while preserving timing and removing noise-only cues', () => {
  const cues = parseSubtitleContent('1\n00:00:01,000 --> 00:00:03,000\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\n[Music]');
  assert.equal(cues.length, 1);
  assert.deepEqual(cues[0], { id: '1', start: 1, end: 3, text: 'Hello' });
});

test('parses timestamped transcript and gives each cue a safe duration', () => {
  const cues = parseSubtitleContent('0:01 Hello\n0:05 World', 'txt');
  assert.equal(cues.length, 2);
  assert.equal(cues[0].end, 5);
  assert.equal(cues[1].end, 9);
});

test('exports valid WEBVTT and keeps original timestamps', () => {
  const output = exportSubtitles([{ id: 'a', start: 1.25, end: 3.5, text: 'Hello', translation: 'سڵاو' }], 'vtt', 'kurdish');
  assert.match(output, /^WEBVTT/);
  assert.match(output, /00:00:01\.250 --> 00:00:03\.500/);
  assert.match(output, /سڵاو/);
});
