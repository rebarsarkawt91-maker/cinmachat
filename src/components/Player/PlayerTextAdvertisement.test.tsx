import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerTextAdvertisement } from './PlayerTextAdvertisement';
import { defaultPlayerTextAd } from '../../lib/playerAds';

test('text advertisements escape markup, preserve the chosen color and include an accessible close button', () => {
  const html = renderToStaticMarkup(<PlayerTextAdvertisement ad={{ ...defaultPlayerTextAd(), enabled: true, text: '<img src=x onerror=alert(1)> بەخێربێن', color: '#12ab34' }} onClose={() => {}} />);
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('color:#12ab34'));
  assert.ok(html.includes('font-weight:800'));
  assert.ok(html.includes('aria-label="داخستنی ڕیکلامی تێکست"'));
});
