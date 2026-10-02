import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLegacyRestTracks } from './kurdSubLegacyRest';

test('deduplicates and caps legacy REST tracks to two per language', () => {
  const entry = (id: number, code: string) => ({
    IDSubtitleFile: id,
    SubDownloadLink: `https://dl.opensubtitles.org/en/download/src-api/filead/${id}.gz`,
    LanguageName: code === 'eng' ? 'English' : 'French',
    SubLanguageID: code,
    SubFileName: `release-${id}.srt`,
  });
  const tracks = selectLegacyRestTracks([entry(1, 'eng'), entry(1, 'eng'), entry(2, 'eng'), entry(3, 'eng'), entry(4, 'fre')]);
  assert.deepEqual(tracks.map((track) => track.fileId), ['1', '2', '4']);
  assert.equal(tracks[0].languageCode, 'eng');
});

test('rejects arbitrary download hosts and malformed file identifiers', () => {
  const track = { IDSubtitleFile: 5, SubDownloadLink: 'https://evil.example/en/download/file/5.gz', SubLanguageID: 'eng' };
  assert.deepEqual(selectLegacyRestTracks([track, { ...track, SubDownloadLink: 'https://dl.opensubtitles.org/en/download/file/5.gz', IDSubtitleFile: '../5' }]), []);
});
