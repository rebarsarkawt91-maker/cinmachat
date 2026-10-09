import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Exercise the actual Studio component with fake credentials/provider responses.
// No production API, saved admin key, or paid translation is used.
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import Studio from './src/components/Admin/KurdSubStudioModal';
      createRoot(document.getElementById('root')).render(<Studio movies={[]} adminName="test-admin" onClose={()=>{}} onApply={async()=>{}}/>);`,
    resolveDir: process.cwd(), loader: 'tsx',
  }, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"test"' },
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  let batches = 0;
  let signedIn = false;
  await page.route('http://studio.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
    if (path === '/api/kurdsub/keys/session') {
      return route.fulfill({ status: signedIn ? 200 : 403, json: signedIn
        ? { geminiKeySession: 'admin-session' } : { error: 'Admin login required' } });
    }
    // A statistics outage must not block translation after authentication.
    if (path === '/api/kurdsub/keys/status') return route.fulfill({ status: 503, json: { error: 'Stats unavailable' } });
    if (path === '/api/kurdsub/translate-batch') {
      const body = route.request().postDataJSON();
      assert.equal(body.geminiKeySession, 'admin-session');
      batches++;
      return route.fulfill({ json: { cues: body.cues.map(cue => ({ index: cue.index, text: 'سڵاو لە تۆ' })) } });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://studio.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.locator('input[type=file]').setInputFiles({ name: 'test.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:01,000 --> 00:00:03,000\nHello there\n') });
  const translate = page.getByRole('button', { name: 'وەرگێڕانی سۆرانی', exact: true });
  await translate.click();
  await page.getByRole('alert').filter({ hasText: 'Admin login required' }).waitFor();
  assert.equal(batches, 0);
  signedIn = true;
  await translate.click();
  await page.getByRole('alert').filter({ hasText: 'وەرگێڕانی سۆرانی تەواو بوو.' }).waitFor();
  assert.equal(batches, 1);
  assert.equal(await page.getByRole('dialog').count(), 1); // Only Studio, no password dialog.
  console.log('PASS: unsigned requests blocked; signed-in admin translates without a password prompt');
} finally { await browser.close(); }
