import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const result = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
import Player from './src/components/Player/YouTubeResilientPlayer';
createRoot(document.getElementById('root')).render(<Player url="https://www.youtube.com/watch?v=0P6B6nE45EQ"/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"test"' } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  let loads = 0;
  await page.route('**/*', route => {
    if (route.request().url().startsWith('https://www.youtube.com/embed/')) {
      loads++;
      return route.fulfill({ contentType: 'text/html', body: `<script>window.addEventListener('message',e=>{ if(JSON.parse(e.data).event==='listening') parent.postMessage(JSON.stringify({event:'onError',info:153}),'*'); });</script>` });
    }
    return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
  });
  await page.goto('https://studio.test/');
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page.getByText('YouTube could not verify this player.', { exact: false }).waitFor();
  assert.equal(loads, 1, 'definitive error must not repeatedly remount player');
  assert.equal(await page.getByRole('link').getAttribute('href'), 'https://www.youtube.com/watch?v=0P6B6nE45EQ');
  console.log('PASS: iframe handshake receives provider error; no reload loop; usable YouTube link remains');
} finally { await browser.close(); }
