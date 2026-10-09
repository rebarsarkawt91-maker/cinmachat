import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit, devices } from 'playwright';

// Test the production bundle without reading or mutating the live database.
for (const [name, engine, options] of [
  ['desktop', chromium, {}], ['iPhone WebKit', webkit, devices['iPhone 13']],
]) {
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
    let catalogRequests = 0;
    const movie = { id: 'manual-1999999999999', title: 'Session catalog fixture', type: 'movie', postType: 'فیلم', image: '', date: '2026-10-10' };
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/movies') {
        catalogRequests++;
        return route.fulfill({ json: { results: [movie] } });
      }
      if (url.pathname === '/catalog-fallback.json') return route.fulfill({ json: { results: [movie] } });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
      if (url.hostname !== 'studio.test') return route.abort();
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      try {
        const body = await readFile(path.join(process.cwd(), 'dist', pathname));
        const contentType = pathname.endsWith('.js') ? 'application/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html';
        return route.fulfill({ contentType, body });
      } catch { return route.fulfill({ status: 404, body: '' }); }
    });
    const page = await context.newPage();
    await page.goto('http://studio.test/', { waitUntil: 'domcontentloaded' });
    await page.getByText(movie.title, { exact: true }).first().waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(movie.title, { exact: true }).first().waitFor();
    assert.equal(catalogRequests, 1, 'reload must reuse session catalog, not make another request');
    const attempted = await page.evaluate(() => JSON.parse(sessionStorage.getItem('cinemachat:firestore-catalog-session:v1'))?.version);
    assert.equal(attempted, 1, 'Firestore attempt must survive navigation/reload even while unavailable');
    console.log(`PASS: ${name} reload retains cards with one catalog request`);
    await context.close();
  } finally { await browser.close(); }
}
