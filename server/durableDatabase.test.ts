import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { isDataMount, MountedDatabase } from './durableDatabase';

const seed = { admins: [{ id: 'demo-owner' }], users: [{ id: 'demo-user' }], manualMovies: [],
  appSnapshots: [{ id: 'demo-snapshot' }], custom: { progress: 12 } };
const mount = (dir: string, type = 'ext4') =>
  '1 0 8:1 / ' + dir.replaceAll('\\', '\\134').replaceAll(' ', '\\040') + ' rw - ' + type + ' /dev/example rw';

test('only the dedicated mount qualifies, never an ancestor or a RAM/overlay mount', () => {
  assert(isDataMount('/disk data', mount('/disk data')));
  for (const type of ['tmpfs', 'overlay', 'ramfs']) assert(!isDataMount('/disk', mount('/disk', type)));
  assert(!isDataMount('/disk/nested', mount('/disk')));
  assert(!isDataMount('/disk', mount('/disk').replace(' rw -', ' ro -')));
  assert(!isDataMount('/disk', mount('/disk').replace('/example rw', '/example ro')));
});

test('offline restore rehearsal using private synthetic records', async t => {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), 'cinamachat-storage-test-')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const app = path.join(base, 'app');
  const dir = path.join(base, 'disk');
  await mkdir(app); await mkdir(dir);
  const file = path.join(dir, 'db.json');
  let mounted = true;
  const makeStore = () => new MountedDatabase(dir, app, async () => mounted ? mount(dir) : '');
  const store = makeStore();
  await t.test('missing database stays missing', async () => {
    await assert.rejects(store.read(), { code: 'ENOENT' });
    await assert.rejects(readFile(file), { code: 'ENOENT' });
  });
  await t.test('corrupt files and public-only indexes are preserved byte for byte', async () => {
    for (const text of ['{invalid', JSON.stringify({ results: [{ id: 'movie' }] })]) {
      await writeFile(file, text);
      await assert.rejects(store.read());
      assert.equal(await readFile(file, 'utf8'), text);
    }
  });
  await writeFile(file, JSON.stringify(seed));
  await t.test('startup awaits an actual commit and propagates a failed write', async () => {
    let checks = 0;
    const failsBeforeCommit = new MountedDatabase(dir, app, async () => ++checks === 1 ? mount(dir) : '');
    const before = await readFile(file);
    await assert.rejects(failsBeforeCommit.openForStartup(), /mount/);
    assert.deepEqual(await readFile(file), before);
    assert.deepEqual(await store.openForStartup(), seed);
  });
  await t.test('the application tree is rejected', async () => {
    const sameTree = new MountedDatabase(dir, base, async () => mount(dir));
    await assert.rejects(sameTree.read(), /outside/);
  });
  await t.test('reads the full seed and retains all fields across a new store instance', async () => {
    assert.deepEqual(await store.read(), seed);
    const next = { ...seed, custom: { progress: 34 } };
    await store.save(JSON.stringify(next));
    assert.deepEqual(await makeStore().read(), next);
  });
  await t.test('missing mount blocks reads and writes, recovery retries safely', async () => {
    const before = await readFile(file);
    mounted = false;
    await assert.rejects(store.read());
    await assert.rejects(store.save(JSON.stringify(seed)));
    assert.deepEqual(await readFile(file), before);
    mounted = true;
    await store.save(JSON.stringify(seed));
    assert.deepEqual(await makeStore().read(), seed);
  });
  await t.test('rejects a catalog-only save and retains private data', async () => {
    const before = await readFile(file);
    await assert.rejects(store.save(JSON.stringify({ results: [] })));
    assert.deepEqual(await readFile(file), before);
  });
  await t.test('a missing file is never recreated by a pending save', async () => {
    const held = path.join(dir, 'held');
    await rename(file, held);
    await assert.rejects(store.save(JSON.stringify(seed)), { code: 'ENOENT' });
    await rename(held, file);
  });
  await t.test('concurrent saves preserve enqueue order and produce complete JSON', async () => {
    const snapshots = Array.from({ length: 16 }, (_, i) => ({ ...seed, sequence: i }));
    await Promise.all(snapshots.map(s => store.save(JSON.stringify(s))));
    assert.deepEqual(await makeStore().read(), snapshots.at(-1));
  });
});
