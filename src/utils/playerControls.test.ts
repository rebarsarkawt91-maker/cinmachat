import test from 'node:test';
import assert from 'node:assert/strict';
import { providerCaptionUrl, providerAction, providerCommandMessage, providerSeekMessage, providerFrameSandbox, providerSeeksOnRelease, readProviderPlaybackEvent, usesProviderTouchControls, setNativePlayerMuted, setNativePlayerVolume, enterIOSVideoFullscreen, enterPlayerElementFullscreen } from './playerControls';

test('provider touch pass-through is restricted to the known HTTPS embed host', () => {
  assert.equal(usesProviderTouchControls('https://proxy.garageband.rocks/embed/movie/tt27613895'), true);
  assert.equal(usesProviderTouchControls('https://proxy.garageband.rocks/embed/tv/tt39325975/1/1?autonext=1'), true);
  assert.equal(usesProviderTouchControls('https://braflix.dev/embed/tv/279246/1/1'), true);
  for (const url of [null, '', 'https://youtube.com/embed/a', 'https://proxy.garageband.rocks.evil.test/embed/a', 'https://proxy.garageband.rocks/', 'http://proxy.garageband.rocks/embed/a']) {
    assert.equal(usesProviderTouchControls(url), false);
  }
});

test('Braflix uses its PLAYER_COMMAND seek/playback contract', () => {
  const source = 'https://braflix.dev/embed/tv/279246/1/1';
  // Pass the wire payload straight to the receiver: Braflix does not JSON.parse.
  assert.deepEqual(providerSeekMessage(source, 123.75), {
    type: 'PLAYER_COMMAND', command: 'seek', value: 123.75,
  });
  assert.deepEqual(providerCommandMessage(source, 'playVideo'), {
    type: 'PLAYER_COMMAND', command: 'play',
  });
  assert.deepEqual(providerCommandMessage(source, 'unMute'), {
    type: 'PLAYER_COMMAND', command: 'unmute',
  });
  assert.deepEqual(readProviderPlaybackEvent({ type: 'PLAYER_EVENT', data: {
    currentTime: 42, duration: 900, event: 'play',
  } }), { currentTime: 42, duration: 900, status: 'playing' });
  assert.deepEqual(readProviderPlaybackEvent({ type: 'PLAYER_EVENT', data: {
    currentTime: 42, duration: 900, event: 'pause',
  } }), { currentTime: 42, duration: 900, status: 'paused' });
  assert.deepEqual(providerCommandMessage(source, 'volume', 65), {
    type: 'PLAYER_COMMAND', command: 'volume', value: 65,
  });
  const proxy = 'https://proxy.garageband.rocks/embed/tv/tt39325975/1/1';
  assert.equal(typeof providerSeekMessage(proxy, 30), 'string');
  assert.equal(typeof providerCommandMessage(proxy, 'playVideo'), 'string');
  assert.equal(providerSeeksOnRelease(source), true);
  assert.equal(providerSeeksOnRelease(proxy), false);
});

test('Braflix sandbox preserves media origins while denying popup and top navigation grants', () => {
  const tokens = providerFrameSandbox('https://braflix.dev/embed/tv/279246/1/1')!.split(' ');
  assert.ok(tokens.includes('allow-scripts'));
  assert.ok(tokens.includes('allow-same-origin'));
  assert.ok(!tokens.some(token => token.includes('popups') || token.includes('top-navigation')));
  assert.equal(providerFrameSandbox('https://proxy.garageband.rocks/embed/tv/tt39325975/1/1'), undefined);
});

test('provider title and verification/loading messages do not establish media readiness', () => {
  for (const payload of [
    { type: 'PLAYER_TITLE', data: { player_progress: 0, player_duration: 2700 } },
    { type: 'PLAYER_EVENT', data: { player_status: 'loading', player_progress: 0, player_duration: 0 } },
    { type: 'PLAYER_EVENT', data: { player_status: 'loading' } },
    '{invalid JSON', null, [], { type: 'PLAYER_EVENT', data: [] },
  ]) assert.equal(readProviderPlaybackEvent(payload), null);
});

test('provider TV events parse object and JSON clocks with explicit playback states', () => {
  const episode = { type: 'PLAYER_EVENT', data: {
    player_progress: 12.5, player_duration: 2700, player_status: 'playing',
  } };
  assert.deepEqual(readProviderPlaybackEvent(episode), { currentTime: 12.5, duration: 2700, status: 'playing' });
  assert.deepEqual(readProviderPlaybackEvent(JSON.stringify({ type: 'PLAYER_EVENT', data: {
    player_progress: '0', player_duration: '2700', player_status: 'paused',
  } })), { currentTime: 0, duration: 2700, status: 'paused' });
  for (const [status, expected] of [['buffering', 'buffering'], ['waiting', 'buffering'], ['ended', 'ended']] as const) {
    assert.equal(readProviderPlaybackEvent({ ...episode, data: { ...episode.data, player_status: status } })?.status, expected);
  }
});

test('provider clocks reject missing, coerced-empty, non-finite and negative values', () => {
  const invalid = [undefined, null, '', ' ', false, [], {}, NaN, Infinity, -1, 'NaN', 'Infinity'];
  for (const value of invalid) {
    assert.equal(readProviderPlaybackEvent({ type: 'PLAYER_EVENT', data: { player_progress: value, player_duration: 120 } }), null);
    assert.equal(readProviderPlaybackEvent({ type: 'PLAYER_EVENT', data: { player_progress: 0, player_duration: value } }), null);
  }
  assert.equal(readProviderPlaybackEvent({ type: 'PLAYER_EVENT', data: { player_progress: 0, player_duration: 0 } }), null);
});

test('unknown or absent provider statuses preserve the valid clock without inventing playback', () => {
  for (const status of [undefined, null, 'loading', 'ready', true, 'PLAYING']) {
    assert.deepEqual(readProviderPlaybackEvent({ type: 'PLAYER_EVENT', data: {
      player_progress: 0, player_duration: 120, player_status: status,
    } }), { currentTime: 0, duration: 120, status: null });
  }
});

test('provider captions off/on preserves the movie and resumes its time and pause state', () => {
  const source = 'https://proxy.garageband.rocks/embed/movie/tt27613895?quality=1080';
  const blank = 'https://www.cinamachat.com/player-captions-off.vtt';
  assert.equal(new URL(providerCaptionUrl(source, false, blank)).searchParams.get('autoplay'), '1');
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
  assert.equal(providerCaptionUrl('https://braflix.dev/embed/tv/279246/1/1', false, blank), 'https://braflix.dev/embed/tv/279246/1/1');
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
