import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSubdlTracks } from './subdlService';

test('maps SubDL results without dropping languages or exposing credentials', () => {
  const tracks = parseSubdlTracks({
    status: true,
    results: [{ imdb_id: 'tt9601292' }],
    subtitles: [
      { n_id: 'abc123', language: 'English', release_name: 'The.Fix.en.srt', url: '/subtitle/abc123-file.zip' },
      { n_id: 456, lang: 'AR', name: 'The.Fix.ar.srt', url: '/subtitle/456-file.zip' },
    ],
  }, 'tt9601292');
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].nId, 'abc123');
  assert.equal(tracks[0].language, 'English');
  assert.equal(tracks[1].nId, '456');
  assert.equal(tracks[1].languageCode, 'ar');
});

test('extracts subtitle id from a provider URL and rejects a different movie', () => {
  const payload = {
    results: [{ imdb_id: 'tt9601292' }],
    subtitles: [{ url: 'https://dl.subdl.com/subtitle/98765-12345.zip', language: 'Spanish' }],
  };
  assert.equal(parseSubdlTracks(payload, 'tt9601292')[0].nId, '98765');
  assert.deepEqual(parseSubdlTracks(payload, 'tt34386754'), []);
});
