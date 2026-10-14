import test from 'node:test';
import assert from 'node:assert/strict';
import { providerCaptionUrl, providerAction, usesProviderTouchControls, setNativePlayerMuted, setNativePlayerVolume, enterIOSVideoFullscreen, enterPlayerElementFullscreen } from './playerControls';

test('provider touch pass-through is restricted to the known HTTPS embed host', () => {
  assert.equal(usesProviderTouchControls('https://proxy.garageband.rocks/embed/movie/tt27613895'), true);
  for (const url of [null, '', 'https://youtube.com/embed/a', 'https://proxy.garageband.rocks.evil.test/embed/a', 'https://proxy.garageband.rocks/', 'http://proxy.garageband.rocks/embed/a']) {
    assert.equal(usesProviderTouchControls(url), false);
  }
});

test('provider captions off/on preserves the movie and resumes its time and pause state', () => {
  const source = 'https://proxy.garageband.rocks/embed/movie/tt27613895?quality=1080';
  const blank = 'https://www.cinamachat.com/player-captions-off.vtt';
  const off = new URL(providerCaptionUrl(source, false, blank, { currentTime: 123.8, playing: false }));
  assert.equal(off.pathname, '/embed/movie/tt27613895');
  assert.equal(off.searchParams.get('sub_url'), blank);
  assert.equal(off.searchParams.get('quality'), '1080');
  assert.equal(off.searchParams.get('startAt'), '123');
  assert.equal(off.searchParams.get('autoplay'), '0');
  const on = new URL(providerCaptionUrl(source, true, blank, { currentTime: 140, playing: true }));
  assert.equal(on.searchParams.get('sub_url'), null);
  assert.equal(on.searchParams.get('ds_lang'), 'en');
  assert.equal(on.searchParams.get('startAt'), '140');
  assert.equal(on.searchParams.get('autoplay'), '1');
  const original = source + '&sub_url=https%3A%2F%2Fexample.test%2Foriginal.vtt&ds_lang=fr';
  assert.equal(new URL(providerCaptionUrl(original, true, blank)).searchParams.get('ds_lang'), 'fr');
  assert.equal(new URL(providerCaptionUrl(original, true, blank)).searchParams.get('sub_url'), 'https://example.test/original.vtt');
  assert.equal(providerCaptionUrl('https://youtube.com/embed/id', false, blank), 'https://youtube.com/embed/id');
});

test('native volume handles HLS, zero mute, recovery, clamping and iOS hardware ownership', () => {
  const video = { muted: false, defaultMuted: false, volume: .5 } as HTMLVideoElement;
  setNativePlayerVolume(video, 0, false);
  assert.equal(video.volume, 0);
  assert.equal(video.muted, true);
  setNativePlayerVolume(video, 65, false);
  assert.equal(video.volume, .65);
  assert.equal(video.muted, false);
  setNativePlayerVolume(video, 200, false);
  assert.equal(video.volume, 1);
  setNativePlayerVolume(video, 0, true);
  assert.equal(video.volume, 1);
  assert.equal(video.muted, true);
  setNativePlayerVolume(video, 50, true);
  assert.equal(video.volume, 1);
  assert.equal(video.muted, false);
  setNativePlayerVolume(video, NaN, false);
  assert.equal(video.volume, 1);
});

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
