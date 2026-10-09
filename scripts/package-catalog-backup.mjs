// Mechanical export of the explicitly authorized public catalog backup.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const raw = fs.readFileSync(process.argv[2], 'utf8');
const data = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
const dir = 'public/catalog-assets';
fs.mkdirSync(dir, { recursive: true });
for (const movie of data.results) {
  if (movie.subtitleText) {
    const text = movie.subtitleText;
    const ext = /^\s*(?:\uFEFF)?WEBVTT/.test(text) ? 'vtt' : 'srt';
    const name = `${createHash('sha256').update(text).digest('hex')}.${ext}`;
    fs.writeFileSync(path.join(dir, name), text);
    movie.subtitleUrl = `/catalog-assets/${name}`;
    delete movie.subtitleText;
  }
  for (const field of ['image', 'posterUrl']) {
    const match = String(movie[field] || '').match(/^data:image\/(png|jpeg|webp);base64,(.+)$/s);
    if (!match) continue;
    const bytes = Buffer.from(match[2], 'base64');
    const name = `${createHash('sha256').update(bytes).digest('hex')}.${match[1]}`;
    fs.writeFileSync(path.join(dir, name), bytes);
    movie[field] = `/catalog-assets/${name}`;
  }
}
fs.writeFileSync('public/catalog-fallback.json', JSON.stringify({ savedAt: data.savedAt, results: data.results }));
console.log(JSON.stringify({ records: data.results.length, metadataBytes: fs.statSync('public/catalog-fallback.json').size }));
