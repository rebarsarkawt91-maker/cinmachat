// Isolated layout regression: production CSS, no live accounts or database writes.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const assets = await readdir('dist/assets');
const css = await readFile(`dist/assets/${assets.find(file => /^index-.*\.css$/.test(file))}`, 'utf8');
const browser = await chromium.launch();
try {
  for (const width of [320, 390, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div class="relative h-screen w-full"><div data-testid="player-control-bar" class="absolute bottom-0 right-0 h-16 flex items-center gap-1.5 px-4">${'<button class="w-11 h-11">CC</button>'.repeat(11)}<div data-testid="player-subtitle-settings" class="absolute bottom-full right-0 mb-3 w-64 p-3">${'<p>Subtitle settings</p>'.repeat(100)}</div></div></div>`);
    const result = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="player-control-bar"]');
      const settings = document.querySelector('[data-testid="player-subtitle-settings"]');
      return { fits: [...bar.querySelectorAll('button')].every(button => { const r = button.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), panelFits: settings.getBoundingClientRect().top >= 0 && settings.getBoundingClientRect().right <= innerWidth, scrollable: settings.scrollHeight > settings.clientHeight, touchHover: matchMedia('(hover: hover) and (pointer: fine)').matches };
    });
    assert.equal(result.fits, true, `${width}: control buttons must fit`);
    assert.equal(result.panelFits, true, `${width}: settings must stay inside viewport`);
    assert.equal(result.scrollable, true, `Long settings must scroll: ${JSON.stringify(result)}`);
    assert.equal(result.touchHover, false, 'Touch must not pin volume popup open');
    console.log(`PASS portrait ${width}: controls fit, settings scroll, touch hover disabled`);
    await page.close();
  }
} finally { await browser.close(); }
