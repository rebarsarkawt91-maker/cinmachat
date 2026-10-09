import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  const start = Date.now();
  let domMs = null;
  page.once('domcontentloaded', () => { domMs = Date.now() - start; });
  const responses = [];
  page.on('response', async response => {
    const url = response.url();
    if (/\/api\/movies(?:\?|$)|catalog-(fallback.json|start.js)/.test(url)) {
      responses.push({ path: new URL(url).pathname, status: response.status(), ms: Date.now() - start });
    }
  });
  await page.goto(process.env.CATALOG_TEST_URL || 'https://www.cinamachat.com/', { waitUntil: 'commit', timeout: 45000 });
  try { await page.locator('[role="button"] img[loading]').first().waitFor({ state: 'visible', timeout: 45000 }); }
  catch { /* report a missing card instead of claiming success */ }
  const cards = await page.locator('[role="button"] img[loading]').count();
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(r => ({path:new URL(r.name).pathname, ms:Math.round(r.duration), bytes:r.transferSize, decoded:r.decodedBodySize})).sort((a,b)=>b.ms-a.ms).slice(0,8));
  console.log(JSON.stringify({ domMs, firstCardMs: cards ? Date.now() - start : null, cards, responses, resources }));
} finally { await browser.close(); }
