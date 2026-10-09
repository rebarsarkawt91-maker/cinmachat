import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { gzipSync, brotliCompressSync, gunzipSync, brotliDecompressSync } from 'node:zlib';
import express from 'express';
import { compressedAssets } from './staticAssetCompression';

test('negotiates compressed assets and leaves identity, missing paths and APIs alone', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'cinema-assets-'));
  const body = Buffer.from('console.log("card");'.repeat(100));
  await writeFile(path.join(directory, 'index-test.js'), body);
  await writeFile(path.join(directory, 'index-test.js.br'), brotliCompressSync(body));
  await writeFile(path.join(directory, 'index-test.js.gz'), gzipSync(body));
  const app = express();
  app.use('/assets', compressedAssets(directory), express.static(directory));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as any).port;
  const request = (url: string, encoding: string) => new Promise<{response: http.IncomingMessage; data: Buffer}>(resolve => {
    http.get(`http://127.0.0.1:${port}${url}`, { headers: { 'Accept-Encoding': encoding } }, response => {
      const chunks: Buffer[] = []; response.on('data', c => chunks.push(c));
      response.on('end', () => resolve({ response, data: Buffer.concat(chunks) }));
    });
  });
  try {
    for (const encoding of ['br', 'gzip', 'identity', 'br;q=0,gzip;q=0']) {
      const {response, data} = await request('/assets/index-test.js', encoding);
      assert.equal(response.statusCode, 200);
      const actual = response.headers['content-encoding'];
      assert.deepEqual(actual === 'br' ? brotliDecompressSync(data) : actual === 'gzip' ? gunzipSync(data) : data, body);
      assert.match(String(response.headers.vary), /Accept-Encoding/);
      if (encoding.includes('q=0') || encoding === 'identity') assert.equal(actual, undefined);
    }
    assert.equal((await request('/api/movies', 'br')).response.statusCode, 404);
    assert.equal((await request('/assets/missing.js', 'br')).response.headers['content-encoding'], undefined);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    await rm(directory, { recursive: true });
  }
});
