import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Render the production build with Firestore unavailable. Both a warm cache
// and a fresh API response must show cards without waiting for Firestore.
const browser = await chromium.launch({ headless: true });
try {
  for (const mode of ['warm', 'fresh', 'slow']) {
    const warm = mode === 'warm';
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const movie = { id: 'manual-1999999999999', title: warm ? 'Warm catalog fixture' : 'API catalog fixture', type: 'movie', postType: 'فیلم', category: 'ئاکشن', tags: ['ئاکشن'], image: '', description: 'fixture', date: '2026-10-09' };
    if (warm) await context.addInitScript(movie => localStorage.setItem('cinemachat:movie-catalog:v1', JSON.stringify({ savedAt: Date.now(), movies: [movie] })), movie);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/movies') {
        if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 8000));
        return route.fulfill({ json: { results: warm ? [] : [movie] } });
      }
      if (url.pathname === '/catalog-fallback.json') return route.fulfill({ json: { results: [movie] } });
      if (url.pathname === '/api/movies/count') return route.fulfill({ json: { count: 1 } });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
      if (url.hostname !== 'studio.test') return route.abort();
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      if (pathname.includes('..')) return route.abort();
      try {
        const body = await readFile(path.join(process.cwd(), 'dist', pathname));
        const contentType = pathname.endsWith('.js') ? 'application/javascript' : pathname.endsWith('.css') ? 'text/css' : pathname.endsWith('.html') ? 'text/html' : 'application/octet-stream';
        return route.fulfill({ contentType, body });
      } catch { return route.fulfill({ status: 404, body: '' }); }
    });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://studio.test/', { waitUntil: 'domcontentloaded' });
    const ready = Date.now();
    await page.getByText(movie.title, { exact: true }).first().waitFor({ timeout: 10000 });
    if (mode === 'slow') assert.ok(Date.now() - ready < 4000, 'snapshot must paint before the slow API finishes');
    assert.ok(!errors.some(error => /before initialization|not defined|Invalid hook/.test(error)), errors.join('\n'));
    assert.ok(!requests.some(url => /\/SyncRoom-[^/]+\.js/.test(url)), 'closed watch-room SDK must not delay homepage cards');
    assert.equal(await page.locator('[role="button"] img[fetchpriority="high"]').count(), 1, 'visible first row must prioritize its poster');
    console.log(`PASS: ${mode} card renders with Firestore unavailable`);
    await context.close();
  }
} finally { await browser.close(); }
