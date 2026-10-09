import { chromium, webkit, devices } from 'playwright';
import assert from 'node:assert/strict';

// Isolated contexts: no previous catalog, login, cookies, or service worker.
for (const [name, engine, options] of [
  ['desktop', chromium, { viewport: { width: 1440, height: 900 } }],
  ['iPhone WebKit simulation', webkit, devices['iPhone 13']],
]) {
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
    const response = await context.request.get('https://www.cinamachat.com/api/movies?view=catalog');
    assert.equal(response.status(), 200);
    const payload = await response.json();
    assert.ok(payload.results.length > 100);
    const subtitle = payload.results.find(movie => String(movie.subtitleUrl || '').startsWith('/catalog-assets/'));
    assert.ok(subtitle);
    const caption = await context.request.get(`https://www.cinamachat.com${subtitle.subtitleUrl}`);
    assert.equal(caption.status(), 200);
    assert.match(await caption.text(), /WEBVTT|-->/);
    const page = await context.newPage();
    const started = Date.now();
    await page.goto('https://www.cinamachat.com/?verify=cold-recovery', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'سەرجەم فیلمەکان', exact: true }).click({ timeout: 60000 });
    const dialog = page.getByRole('dialog', { name: 'سەرجەم فیلمەکان', exact: true });
    await dialog.locator('[role="button"] img[loading]').nth(51).waitFor({ timeout: 60000 });
    const count = await dialog.locator('[role="button"] img[loading]').count();
    assert.ok(count > 51, `${name} must not retain old 51-film fallback`);
    console.log(JSON.stringify({ name, cards: count, elapsedMs: Date.now() - started }));
    await context.close();
  } finally { await browser.close(); }
}
