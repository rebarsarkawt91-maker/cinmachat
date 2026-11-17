import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOX_OFFICE_WEEKEND_URL,
  OFFICIAL_ENTERTAINMENT_FEEDS,
  OFFICIAL_SERIES_FEEDS,
  parseBoxOfficeWeekendPage,
  parseOfficialEntertainmentFeed,
  parseOfficialSeriesFeed,
} from './heroFeeds';

const source = OFFICIAL_ENTERTAINMENT_FEEDS[1];

test('official RSS parser keeps short descriptions, links, dates and provider images', () => {
  const xml = `<rss><channel><item>
    <title><![CDATA[Actor &amp; Director News]]></title>
    <link>https://variety.com/2026/film/news/example-123/</link>
    <pubDate>Tue, 17 Nov 2026 07:20:28 +0000</pubDate>
    <category><![CDATA[Movies]]></category>
    <description><![CDATA[<p>A short story summary with <b>names</b>.</p>]]></description>
    <media:thumbnail url="https://variety.com/wp-content/uploads/example.jpg" />
  </item></channel></rss>`;
  const result = parseOfficialEntertainmentFeed(xml, source);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Actor & Director News');
  assert.equal(result[0].description, 'A short story summary with names.');
  assert.equal(result[0].image, 'https://variety.com/wp-content/uploads/example.jpg');
  assert.equal(result[0].publishedAt, '2026-11-17T07:20:28.000Z');
});

test('box-office weekend parser accepts only ranked top ten rows', () => {
  const rows = Array.from({ length: 10 }, (_, index) => `<tr><td>${index + 1}</td><td>-</td><td><a>Film ${index + 1}</a></td><td>$${index + 1},000,000</td></tr>`).join('');
  const result = parseBoxOfficeWeekendPage(`<html><title>Weekend 46 - Box Office Mojo</title><body>November 13-15, 2026<table>${rows}</table></body></html>`);
  assert.equal(result.period, 'November 13-15, 2026');
  assert.deepEqual(result.items.map(item => item.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(result.items[2].title, 'Film 3');
});

test('series RSS parser keeps only external series stories and region metadata', () => {
  const source = OFFICIAL_SERIES_FEEDS[2];
  const xml = `<rss><channel><item>
    <title><![CDATA[New K-Drama Series Announces Its Cast]]></title>
    <link>https://www.soompi.com/article/123456wpp/new-k-drama-series</link>
    <pubDate>Tue, 17 Nov 2026 07:20:28 +0000</pubDate>
    <category><![CDATA[K-Drama]]></category>
    <description><![CDATA[The upcoming drama series has begun production.]]></description>
  </item><item>
    <title><![CDATA[Music chart update]]></title>
    <link>https://www.soompi.com/article/999999wpp/music-chart</link>
    <pubDate>Tue, 17 Nov 2026 07:19:28 +0000</pubDate>
    <category><![CDATA[K-Pop]]></category>
    <description><![CDATA[A chart update.]]></description>
  </item></channel></rss>`;
  const result = parseOfficialSeriesFeed(xml, source);
  assert.equal(result.length, 1);
  assert.equal(result[0].region, 'کۆری');
  assert.equal(result[0].source, 'Soompi');
});

test('official endpoints are fixed HTTPS origins', () => {
  assert.match(BOX_OFFICE_WEEKEND_URL, /^https:\/\/www\.boxofficemojo\.com\//);
  assert.ok(OFFICIAL_ENTERTAINMENT_FEEDS.every(feed => /^https:\/\//.test(feed.url)));
  assert.ok(OFFICIAL_SERIES_FEEDS.every(feed => /^https:\/\//.test(feed.url)));
});
