// Isolated two-origin hit-testing regression using the shipped player CSS.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
const files = await readdir('dist/assets');
const css = await readFile(`dist/assets/${files.find(f => /^index-.*\.css$/.test(f))}`, 'utf8');
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await page.route('https://provider.test/**', route => route.fulfill({ contentType: 'text/html', body: `<body style="margin:0;background:black;color:white"><div id="controls">Provider controls</div><script>let timer;document.addEventListener('pointerdown',()=>{document.querySelector('#controls').hidden=false;parent.postMessage('touched','*');clearTimeout(timer);timer=setTimeout(()=>document.querySelector('#controls').hidden=true,2800);});</script>` }));
    await page.route('https://app.test/**', route => route.fulfill({ contentType: 'text/html', body: `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div class="relative h-screen w-full"><iframe src="https://provider.test/" class="absolute inset-0 w-full h-full"></iframe><div id="glass" class="absolute inset-0 z-[42] cursor-default pointer-events-none"></div><button id="custom" class="absolute bottom-0 right-0 z-[60]" onclick="window.customClicks=(window.customClicks||0)+1">Play</button></div><script>window.touches=0;addEventListener('message',e=>{if(e.origin==='https://provider.test'&&e.data==='touched')window.touches++});</script>` }));
    await page.goto('https://app.test/');
    await page.frameLocator('iframe').locator('#controls').waitFor();
    await page.touchscreen.tap(180, 250);
    await page.waitForFunction(() => window.touches === 1);
    await page.frameLocator('iframe').locator('#controls').waitFor({ state: 'hidden', timeout: 5000 });
    await page.locator('#custom').tap();
    assert.equal(await page.evaluate(() => window.customClicks), 1);
    assert.equal(await page.evaluate(() => window.touches), 1, 'custom toolbar must retain touch ownership');
    // Reproduce the old opaque interaction layer swallowing source touches.
    await page.locator('#glass').evaluate(el => el.classList.remove('pointer-events-none'));
    await page.touchscreen.tap(180, 250);
    assert.equal(await page.evaluate(() => window.touches), 1);
    console.log(`PASS ${engine.name()}: touch reaches provider, idle hide works, custom toolbar remains interactive; old glass blocks touch.`);
  } finally { await browser.close(); }
}
