import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

export function isDataMount(directory: string, mountInfo: string): boolean {
  return mountInfo.split('\n').some(line => {
    const [mount, storage] = line.split(' - ');
    const mountFields = mount.split(' ');
    const encoded = mountFields[4];
    if (!encoded || !storage) return false;
    const point = encoded.replace(/\\([0-7]{3})/g, (_, octal: string) =>
      String.fromCharCode(parseInt(octal, 8)));
    const [fsType, , superOptions] = storage.split(' ');
    return point === directory && mountFields[5]?.split(',').includes('rw') &&
      superOptions?.split(',').includes('rw') && !['overlay', 'tmpfs', 'ramfs', 'rootfs'].includes(fsType);
  });
}

function parseDatabase(text: string) {
  let db;
  try { db = JSON.parse(text); } catch { throw new Error('Invalid database JSON.'); }
  if (!Array.isArray(db?.admins) || !db.admins.length || !Array.isArray(db.users) ||
      !Array.isArray(db.manualMovies)) {
    throw new Error('Expected a full database export with admin, user and movie collections.');
  }
  return db;
}

export class MountedDatabase {
  private writes: Promise<void> = Promise.resolve();
  readonly file: string;

  constructor(private directory: string, private appRoot: string,
    private mountInfo = () => readFile('/proc/self/mountinfo', 'utf8')) {
    this.file = path.join(directory, 'db.json');
  }

  private async checkFile(): Promise<void> {
    const dir = this.directory;
    if (!path.isAbsolute(dir) || path.resolve(dir) !== dir || dir === path.parse(dir).root ||
        (await realpath(dir)) !== dir || !isDataMount(dir, await this.mountInfo())) {
      throw new Error('A dedicated mounted data directory is required.');
    }
    const relative = path.relative(await realpath(this.appRoot), dir);
    if (!(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))) {
      throw new Error('The data directory must be outside the application.');
    }
    const stat = await lstat(this.file);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('Expected a regular database file.');
  }

  async read(): Promise<any> {
    await this.checkFile();
    return parseDatabase(await readFile(this.file, 'utf8'));
  }

  async openForStartup(): Promise<any> {
    const state = await this.read();
    // Exercise the actual atomic commit before any recovery or startup migrations.
    await this.save(JSON.stringify(state, null, 2));
    return state;
  }

  save(snapshot: string): Promise<void> {
    const write = this.writes.then(() => this.replace(snapshot));
    // Each caller gets its own error. A transient failure must not poison later saves.
    this.writes = write.catch(() => {});
    return write;
  }

  private async replace(snapshot: string): Promise<void> {
    parseDatabase(snapshot);
    await this.checkFile();
    const temporary = path.join(this.directory, '.db-' + randomUUID() + '.tmp');
    const handle = await open(temporary, 'wx', 0o600);
    try {
      try {
        await handle.writeFile(snapshot, 'utf8');
        await handle.sync();
      } finally { await handle.close(); }
      await rename(temporary, this.file);
      if (process.platform === 'linux') {
        const directory = await open(this.directory, 'r');
        try { await directory.sync(); } finally { await directory.close(); }
      }
    } finally {
      await unlink(temporary).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
      });
    }
  }
}
