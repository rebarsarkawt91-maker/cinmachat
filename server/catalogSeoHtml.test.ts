import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogSeo, buildDramaRoomSeo } from '../src/lib/catalogSeo';
import { renderCatalogHtml } from './catalogSeoHtml';

const template = '<html><head><title>Home</title><meta name="description" content="Old"><meta name="keywords" content="spam"><link rel="canonical" href="https://www.cinamachat.com/"><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>';

test('first HTML response has unique title, metadata, canonical, visible heading and crawlable links', () => {
  const seo = buildDramaRoomSeo({ id: 'room', title: 'Drama Room' });
  const html = renderCatalogHtml(template, seo, [
    { href: 'https://www.cinamachat.com/?movieId=ep1', title: 'Episode one' },
    { href: 'javascript:alert(1)', title: 'Unsafe link' },
  ]);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.match(html, /<h1>Drama Room<\/h1>/);
  assert.match(html, /href="https:\/\/www.cinamachat.com\/\?movieId=ep1"/);
  assert.doesNotMatch(html, /Unsafe link|name="keywords"/);
  assert.match(html, /src="\/assets\/app.js"/, 'The normal React entry stays intact');
});

test('hostile imported metadata cannot terminate JSON-LD or inject HTML', () => {
  const seo = buildCatalogSeo({ id: 'x', title: 'Quotes " & $&', description: 'Safe' });
  seo.schema.name = '</script><script>alert(1)</script>';
  const html = renderCatalogHtml(template, seo);
  assert.match(html, /Quotes &quot; &amp; \$&amp;/);
  assert.doesNotMatch(html, /<script>alert\(1\)/);
  const json = html.match(/<script id="cinemachat-movie-jsonld" type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
  assert.equal(JSON.parse(json).name, '</script><script>alert(1)</script>');
});
