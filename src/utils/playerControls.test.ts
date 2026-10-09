import test from 'node:test';
import assert from 'node:assert/strict';
import { providerAction, setNativePlayerMuted, enterIOSVideoFullscreen } from './playerControls';

test('provider unmute is lower-case without changing YouTube command names', () => {
  assert.equal(providerAction('unMute'), 'unmute');
  assert.equal(providerAction('mute'), 'mute');
  assert.equal(providerAction('pauseVideo'), 'pause');
});
test('native mute can be reversed and restores zero volume outside iOS', () => {
  const video = { muted: false, defaultMuted: false, volume: 0 } as HTMLVideoElement;
  setNativePlayerMuted(video, true, false, 80);
  assert.equal(video.muted, true);
  setNativePlayerMuted(video, false, false, 80);
  assert.equal(video.muted, false);
  assert.equal(video.defaultMuted, false);
  assert.equal(video.volume, .8);
  video.volume = 0;
  setNativePlayerMuted(video, false, true, 80);
  assert.equal(video.volume, 0, 'iOS hardware volume must not be assigned');
});
test('iOS fullscreen invokes native API synchronously, rejects stale refs and contains failure', () => {
  let calls = 0;
  const video = { isConnected: true, webkitEnterFullscreen: () => calls++ } as any;
  assert.equal(enterIOSVideoFullscreen(video), true);
  assert.equal(calls, 1);
  video.isConnected = false;
  assert.equal(enterIOSVideoFullscreen(video), false);
  assert.equal(calls, 1);
  assert.equal(enterIOSVideoFullscreen({ isConnected: true, webkitEnterFullscreen: () => { throw new Error('blocked'); } } as any), false);
  assert.equal(enterIOSVideoFullscreen(null), false, 'iframe needs viewport fallback');
  let mode = '';
  assert.equal(enterIOSVideoFullscreen({ isConnected: true, webkitSetPresentationMode: (value: string) => { mode = value; } } as any), true);
  assert.equal(mode, 'fullscreen');
});
