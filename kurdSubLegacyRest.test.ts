import test from 'node:test';
import assert from 'node:assert/strict';
import { assSubtitleToSrt, legacyRestTitleQuery, selectLegacyRestTracks } from './kurdSubLegacyRest';

test('deduplicates legacy REST tracks without dropping releases from one language', () => {
  const entry = (id: number, code: string) => ({
    IDSubtitleFile: id,
    SubDownloadLink: `https://dl.opensubtitles.org/en/download/src-api/filead/${id}.gz`,
    LanguageName: code === 'eng' ? 'English' : 'French',
    SubLanguageID: code,
    SubFileName: `release-${id}.srt`,
  });
  const tracks = selectLegacyRestTracks([entry(1, 'eng'), entry(1, 'eng'), entry(2, 'eng'), entry(3, 'eng'), entry(4, 'fre')]);
  assert.deepEqual(tracks.map((track) => track.fileId), ['1', '2', '3', '4']);
  assert.equal(tracks[0].languageCode, 'eng');
});

test('rejects arbitrary download hosts and malformed file identifiers', () => {
  const track = { IDSubtitleFile: 5, SubDownloadLink: 'https://evil.example/en/download/file/5.gz', SubLanguageID: 'eng' };
  assert.deepEqual(selectLegacyRestTracks([track, { ...track, SubDownloadLink: 'https://dl.opensubtitles.org/en/download/file/5.gz', IDSubtitleFile: '../5' }]), []);
});

test('sanitizes the approved fallback title into a bounded search path', () => {
  assert.equal(legacyRestTitleQuery('Once Upon a Time in the Middle East 2026'), 'once+upon+a+time+in+the+middle+east+2026');
  assert.equal(legacyRestTitleQuery('  Title /../ <script>  '), 'title+script');
});

test('converts ASS dialogue, including commas and line breaks, into SRT cues', () => {
  const ass = '[Script Info]\nTitle: Example\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.20,0:00:03.45,Default,,0,0,0,,{\\i1}سڵاو, دنیا\\Nهەمووان';
  assert.equal(assSubtitleToSrt(ass), '1\n00:00:01,200 --> 00:00:03,450\nسڵاو, دنیا\nهەمووان');
  assert.equal(assSubtitleToSrt('1\n00:00:01,000 --> 00:00:02,000\nHello'), '1\n00:00:01,000 --> 00:00:02,000\nHello');
});
