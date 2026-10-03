import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { parseSubdlTracks, unpackSubdlSubtitleArchive } from './subdlService';

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
  assert.equal(tracks[0].downloadUrl, 'https://dl.subdl.com/subtitle/abc123-file.zip');
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

test('accepts a numeric IMDb result ID without mixing different movies', () => {
  const payload = {
    results: [{ imdb_id: 9601292 }],
    subtitles: [{
      release_name: 'The.Fix.2026.1080p.WEBRip.x264-AAC',
      lang: 'English',
      url: '/subtitle/3194821-the-fix-2026-english.zip',
      unpack_files: ['The.Fix.2026.1080p.WEBRip.x264-AAC.srt'],
    }],
  };
  const tracks = parseSubdlTracks(payload, 'tt9601292');
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].downloadUrl, 'https://dl.subdl.com/subtitle/3194821-the-fix-2026-english.zip');
  assert.deepEqual(parseSubdlTracks(payload, 'tt34386754'), []);
});

test('reads a subtitle from a ZIP without extracting files to disk', async () => {
  const zip = new JSZip();
  zip.file('movie.srt', '1\n00:00:01,000 --> 00:00:02,000\nHello\n');
  const archive = await zip.generateAsync({ type: 'nodebuffer' });
  const file = await unpackSubdlSubtitleArchive(archive, 1024);
  assert.match(file.toString('utf8'), /Hello/);
  await assert.rejects(() => unpackSubdlSubtitleArchive(archive, 10), /too large/);
});
