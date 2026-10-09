import test from 'node:test';
import assert from 'node:assert/strict';
import { providerAction, setNativePlayerMuted, enterIOSVideoFullscreen, enterPlayerElementFullscreen } from './playerControls';

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
  assert.equal(enterIOSVideoFullscreen({ isConnected: true, webkitEnterFullscreen: () => { throw Error('unavailable'); }, webkitSetPresentationMode: (value: string) => { mode = value; } } as any), true);
});
test('element fullscreen and rejected/unsupported WebKit use the correct fallback', async () => {
  let fallback = 0;
  let native = 0;
  enterPlayerElementFullscreen({ webkitRequestFullscreen: () => native++ } as any, () => fallback++);
  assert.equal(native, 1);
  assert.equal(fallback, 0);
  enterPlayerElementFullscreen({ requestFullscreen: () => Promise.reject(Error('unsupported')) } as any, () => fallback++);
  await Promise.resolve();
  assert.equal(fallback, 1);
  enterPlayerElementFullscreen({} as any, () => fallback++);
  assert.equal(fallback, 2);
});
