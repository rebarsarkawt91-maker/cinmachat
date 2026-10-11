import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { usesProviderTouchControls } from '../src/utils/playerControls';

// Run the production callback with a virtual clock; no network or account writes.
const source = readFileSync('src/App.tsx', 'utf8');
const body = source.match(/const revealPlayerControls = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\);/)?.[1];
assert.ok(body, 'Production reveal callback must be present');

function fixture(url: string, playing = true) {
  const jobs = new Map<number, { run: () => void; delay: number }>();
  let id = 0;
  let visible = false;
  const timer = { current: null as number | null };
  const currentUrl = { current: url };
  const state = { current: playing };
  const reveal = new Function('setPlayerControlsVisible', 'playerControlsTimerRef',
    'setTimeout', 'clearTimeout', 'playerPlayingRef', 'usesProviderTouchControls',
    'activeServerUrlRef', `return () => {${body}};`)(
      (value: boolean) => { visible = value; }, timer,
      (run: () => void, delay: number) => { jobs.set(++id, { run, delay }); return id; },
      (key: number) => jobs.delete(key), state, usesProviderTouchControls, currentUrl);
  return { reveal, jobs, timer, currentUrl, visible: () => visible };
}

test('provider controls hide 1.5 seconds earlier; repeated touches restart one timer', () => {
  const f = fixture('https://proxy.garageband.rocks/embed/movie/tt27613895');
  f.reveal();
  f.reveal();
  assert.equal(f.jobs.size, 1);
  const job = [...f.jobs.values()][0];
  assert.equal(job.delay, 1000);
  assert.equal(f.visible(), true);
  job.run();
  assert.equal(f.visible(), false);
  assert.equal(f.timer.current, null);
});

test('paused controls remain visible and other providers retain 2.5 seconds', () => {
  const f = fixture('https://proxy.garageband.rocks/embed/movie/tt27613895', false);
  f.reveal();
  [...f.jobs.values()][0].run();
  assert.equal(f.visible(), true);
  f.currentUrl.current = 'https://youtube.com/embed/example';
  f.jobs.clear();
  f.reveal();
  assert.equal([...f.jobs.values()][0].delay, 2500);
});
