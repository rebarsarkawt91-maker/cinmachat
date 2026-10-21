import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { usesCatalogSubtitles } from './catalogSubtitleMode';
import { parseSubtitleCues } from '../hooks/useSubtitleManager';

test('ordinary films and drama episodes use saved subtitles, not the room translator', () => {
  for (const selectedDramaRoom of [null, { id: 'the-8-show' }, { id: 'joseph' }]) {
    assert.equal(usesCatalogSubtitles(true, undefined), true, String(selectedDramaRoom?.id));
    assert.equal(usesCatalogSubtitles(true, false), true);
  }
  assert.equal(usesCatalogSubtitles(true, true), false, 'VIP remains on its existing pipeline');
  assert.equal(usesCatalogSubtitles(false, undefined), false);
  assert.equal(usesCatalogSubtitles(false, true), false);
});
test('uploaded episode VTT has real timed cues and separate episodes never share cues', () => {
  const first = parseSubtitleCues('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nئەڵقەی یەکەم\n');
  const second = parseSubtitleCues('WEBVTT\n\n00:00:04.000 --> 00:00:06.000\nئەڵقەی دووەم\n');
  assert.equal(first.find(cue => 2 >= cue.start && 2 <= cue.end)?.text, 'ئەڵقەی یەکەم');
  assert.equal(second.find(cue => 2 >= cue.start && 2 <= cue.end), undefined);
  assert.equal(second.find(cue => 5 >= cue.start && 5 <= cue.end)?.text, 'ئەڵقەی دووەم');
});
test('the player wires the shared mode to saved VTT overlay, CC controls and translator exclusion', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /isCatalogMoviePlayer = usesCatalogSubtitles\(isRoomModalActive, activeSyncGroup\?\.isVIP\)/);
  assert.match(app, /enabled: isInMainWatchRoom && !isCatalogMoviePlayer && ccSettings\.showSubtitle/);
  assert.match(app, /isCatalogMoviePlayer && ccSettings\.showSubtitle && mainMovieActiveSubtitleText/);
  assert.match(app, /isCatalogMoviePlayer && \([\s\S]*?data-testid="original-cc-button"/);
  assert.match(app, /isRoomModalActive && !isCatalogMoviePlayer && \([\s\S]*?<RoomSubtitleSelector/);
});
