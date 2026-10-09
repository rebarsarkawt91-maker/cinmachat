import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compactCatalogMovie } from './catalogDelivery';
import { cacheableCatalogMovie } from './src/lib/catalogCache';

test('complete cue text becomes a downloadable asset without changing its database record', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'cinema-catalog-test-'));
  const text = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nسڵاو\n\n'.repeat(500);
  const original = { id: 'movie-1', title: 'Movie', subtitleText: text, videoUrl: 'https://example.com/movie.mp4' };
  const result = compactCatalogMovie(original, directory);
  assert.equal(original.subtitleText, text);
  assert.equal(result.subtitleText, '');
  assert.equal(result.videoUrl, original.videoUrl);
  assert.equal(readFileSync(path.join(directory, path.basename(result.subtitleUrl)), 'utf8'), text);
  assert.ok(JSON.stringify(result).length < JSON.stringify(original).length / 20);
  const live = { ...result, subtitleText: text, subtitleUrl: '' };
  const cached = cacheableCatalogMovie(live);
  assert.equal(cached.subtitleUrl, result.subtitleUrl);
  assert.equal(cached.subtitleText, '');
  assert.equal(live.subtitleText, text);
});
test('small records and a failed materialization retain their original captions', () => {
  const small = { subtitleText: 'short' };
  assert.equal(compactCatalogMovie(small, ''), small);
  const large = { subtitleText: 'caption'.repeat(1000) };
  assert.equal(compactCatalogMovie(large, '\u0000'), large);
});
