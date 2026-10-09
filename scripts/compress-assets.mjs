import { readdir, readFile, writeFile } from 'node:fs/promises';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import path from 'node:path';

// Compress immutable build output once. No request-time CPU or API caching.
const directory = path.resolve('dist/assets');
for (const name of await readdir(directory)) {
  if (!/\.(js|css)$/.test(name)) continue;
  const file = path.join(directory, name);
  const body = await readFile(file);
  await Promise.all([
    writeFile(file + '.br', brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } })),
    writeFile(file + '.gz', gzipSync(body, { level: 9 })),
  ]);
}
console.log('Precompressed JS/CSS assets (Brotli + gzip)');
