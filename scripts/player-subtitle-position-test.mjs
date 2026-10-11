// Exercise the actual JSX position expression in short mobile viewports.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const source = await readFile('src/App.tsx', 'utf8');
const helper = source.match(/const ccSubtitleBottomPercent = \(offsetY: number \| undefined\): string => \{([\s\S]*?)\r?\n\};/);
assert.ok(helper, 'Locate the production subtitle position helper');
const bottom = new Function('offsetY', 'DEFAULT_CC_SETTINGS', helper[1]);
const overlay = source.slice(source.indexOf('data-testid="main-movie-kurdish-subtitle"'), source.indexOf('data-testid="main-movie-kurdish-subtitle"') + 650);
assert.match(overlay, /bottom: ccSubtitleBottomPercent\(ccSettings.subtitleOffsetY\)/);
assert.doesNotMatch(source, /subtitleOffset=\{Math.round\(\(ccSettings.subtitleOffsetY/,
  'Subtitle adjustment must not move the provider video');

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const [width, height] of [[844, 390], [667, 280], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.setContent('<div id="frame" style="position:fixed;inset:0"><div id="subtitle" style="position:absolute;height:24px">Subtitle</div></div>');
      const positions = [];
      for (const offset of [0, 10, 50, 100]) {
        positions.push(await page.evaluate(value => {
          const el = document.querySelector('#subtitle');
          el.style.bottom = value;
          return innerHeight - el.getBoundingClientRect().bottom;
        }, bottom(offset, { subtitleOffsetY: 15 })));
      }
      assert.ok(Math.abs(positions[0] - height * .06) < 1, 'Lowest position reaches the bottom safe margin');
      assert.ok(positions.every((v, i) => !i || v > positions[i - 1]), 'Every up/down step changes position');
      console.log(`PASS ${engine.name()} ${width}x${height}: subtitle moves independently, lowest inset ${positions[0].toFixed(1)}px`);
      await page.close();
    }
  } finally { await browser.close(); }
}
