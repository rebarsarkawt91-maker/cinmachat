import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getHeroBackgroundYouTubeId,
  parseHeroBackground,
  parseHeroBackgroundMedia,
  parseHeroBackgroundUpdate,
  type HeroBackgroundSettings,
} from '../src/utils/heroBackground';
import { createHeroBackgroundStore } from './heroBackground';

const raster = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==';
const clip = { kind: 'video', url: 'https://media.example.org/background.mp4' } as const;
const youtube = { kind: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } as const;

test('background YouTube URLs are canonicalized from exact video hosts and paths', () => {
  for (const url of [
    'https://youtu.be/dQw4w9WgXcQ?si=tracking',
    'https://www.youtube.com/watch?list=anything&v=dQw4w9WgXcQ',
    'https://m.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1',
  ]) {
    assert.deepEqual(parseHeroBackgroundMedia({ kind: 'youtube', url }), youtube);
    assert.deepEqual(parseHeroBackgroundMedia({ kind: 'video', url }), youtube);
  }
  for (const url of [
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com@evil.test/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com:9999/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/channel/dQw4w9WgXcQ',
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQextra',
  ]) {
    assert.equal(getHeroBackgroundYouTubeId(url), null);
  }
  assert.equal(parseHeroBackgroundMedia({ kind: 'video', url: 'https://www.youtube.com/playlist?list=one' }), null);
  assert.deepEqual(parseHeroBackground({ mode: 3, slots: {
    3: { kind: 'video', url: 'https://youtu.be/dQw4w9WgXcQ?si=tracking' },
    4: { kind: 'video', url: 'https://www.youtube.com/playlist?list=one' },
    5: clip,
  } }), { mode: 3, slots: { 3: youtube, 5: clip } });
});

test('classic slot remains read-only while legacy links in editable slots migrate', () => {
  assert.deepEqual(parseHeroBackground({ mode: 8, media: clip }), { mode: 8, slots: { 8: clip } });
  assert.deepEqual(parseHeroBackground({ mode: 2, media: clip }), { mode: 2 });
  assert.deepEqual(parseHeroBackgroundUpdate({ mode: 2 }), { mode: 2 });
  assert.equal(parseHeroBackgroundUpdate({ mode: 2, media: clip }), null);
  assert.equal(parseHeroBackgroundUpdate({ slot: { mode: 2, media: clip } }), null);
  assert.equal(parseHeroBackgroundUpdate({ slot: { mode: 2, media: null } }), null);
  assert.equal(parseHeroBackgroundUpdate({ slot: { mode: 20 } }), null);
  assert.equal(parseHeroBackgroundUpdate({ mode: 21 }), null);
  assert.equal(parseHeroBackground({ mode: 2, slots: { 2: clip } }), null);
});

test('queued updates preserve other slots, and only changing the default changes its revision', async () => {
  let finishRead!: (settings: unknown) => void;
  const reading = new Promise(resolve => { finishRead = resolve; });
  let saved: HeroBackgroundSettings | undefined;
  const store = createHeroBackgroundStore({
    read: () => reading,
    write: async settings => { saved = settings; },
  });
  const startup = store.load();
  const added = store.save({ slot: { mode: 4, media: youtube } }, 'admin');
  const setDefault = store.save({ mode: 4, slot: { mode: 3, media: clip } }, 'admin');
  finishRead({ mode: 7, media: clip });
  await startup;
  const first = await added;
  const next = await setDefault;
  assert.deepEqual(first, { mode: 7, slots: { 4: youtube, 7: clip } });
  assert.deepEqual(next?.slots, { 3: clip, 4: youtube, 7: clip });
  assert.equal(next?.mode, 4);
  assert.ok(next?.revision);
  assert.deepEqual(saved, next);

  const removed = await store.save({ slot: { mode: 3, media: null } }, 'admin');
  assert.equal(removed?.revision, next?.revision);
  assert.deepEqual(removed?.slots, { 4: youtube, 7: clip });
  const classic = await store.save({ mode: 2 }, 'admin');
  const returned = await store.save({ mode: 4 }, 'admin');
  assert.notEqual(classic?.revision, next?.revision);
  assert.notEqual(returned?.revision, next?.revision);
  assert.deepEqual(returned?.slots, removed?.slots);
});

test('legacy raster files remain durable and failed writes keep the previous live settings', async () => {
  let stored: unknown = { mode: 3, media: { kind: 'image', url: raster } };
  let fail = false;
  const storage = {
    read: async () => stored,
    write: async (value: HeroBackgroundSettings) => {
      if (fail) throw new Error('storage unavailable');
      stored = value;
    },
  };
  const store = createHeroBackgroundStore(storage);
  await store.load();
  const image = store.get().slots?.[3];
  assert.match(image?.url ?? '', /^\/api\/hero-background-image\/[a-f0-9]{64}$/);
  const hash = image?.url.split('/').at(-1) ?? '';
  assert.equal(store.getImage(hash)?.mime, 'image/png');
  const changed = await store.save({ mode: 3, slot: { mode: 9, media: image! } }, 'admin');
  assert.deepEqual(changed?.slots?.[9], image);
  fail = true;
  await assert.rejects(store.save({ slot: { mode: 3, media: null } }, 'admin'));
  assert.deepEqual(store.get(), changed);
  const restarted = createHeroBackgroundStore(storage);
  await restarted.load();
  assert.deepEqual(restarted.get(), changed);
  assert.equal(restarted.getImage(hash)?.mime, 'image/png');

  fail = false;
  await restarted.save({ slot: { mode: 3, media: clip } }, 'admin');
  assert.equal(restarted.getImage(hash)?.mime, 'image/png', 'The other slot still uses the upload');
  const replacement = await restarted.save({ slot: { mode: 9, media: youtube } }, 'admin');
  assert.deepEqual(replacement?.slots, { 3: clip, 9: youtube });
  assert.equal(restarted.getImage(hash), undefined, 'There are no remaining references to the upload');
  assert.ok(!JSON.stringify(stored).includes(raster), 'Old bytes were removed from durable settings');
  const loadedAgain = createHeroBackgroundStore(storage);
  await loadedAgain.load();
  assert.deepEqual(loadedAgain.get(), replacement);
  assert.equal(loadedAgain.getImage(hash), undefined);
});
