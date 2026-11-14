import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogSeo, buildDramaRoomSeo, catalogMovieUrl, plainSeoText } from './catalogSeo';

test('titles match real subtitle and dub availability without blanket claims', () => {
  const movie = { id: 'film-1', title: 'A Film &amp; Story', year: '2024', rating: 9 };
  const plain = buildCatalogSeo(movie);
  assert.equal(plain.heading, 'A Film & Story (2024)');
  assert.doesNotMatch(plain.title, /ژێرنووس|دۆبلاژ/);
  assert.equal(plain.schema.aggregateRating, undefined);
  assert.match(buildCatalogSeo({ ...movie, subtitleText: 'WEBVTT' }).title, /بە ژێرنووسی کوردی/);
  assert.match(buildCatalogSeo({ ...movie, kurdishSubtitleUrl: '/track.vtt' }).description, /Kurdish subtitles/);
  assert.doesNotMatch(buildCatalogSeo({ ...movie, isDubbed: true, language: 'English' }).title, /دۆبلاژ/);
  assert.match(buildCatalogSeo({ ...movie, isKurdishDubbed: true }).title, /بە دۆبلاژی کوردی/);
});

test('drama episodes and room collections use their own canonical URLs and honest schemas', () => {
  const episodes = [{ id: 'episode-1', title: 'Drama one', subtitleText: 'WEBVTT' }, { id: 'episode-2', title: 'Drama two' }];
  const room = { id: 'room-1', title: 'دراماکان' };
  const seo = buildCatalogSeo(episodes[0], { room, episodeNumber: 1 });
  assert.equal(seo.kind, 'TVEpisode');
  assert.equal(seo.schema.episodeNumber, 1);
  assert.equal((seo.schema.isPartOf as any)['@type'], 'CollectionPage');
  const collection = buildDramaRoomSeo(room, episodes);
  assert.equal(collection.kind, 'CollectionPage');
  assert.equal(collection.canonical, 'https://www.cinamachat.com/?dramaRoomId=room-1');
  assert.equal((collection.schema.mainEntity as any).itemListElement.length, 2);
  assert.doesNotMatch(collection.title, /ژێرنووس/, 'One subtitled episode does not label all episodes subtitled');
  assert.equal(buildCatalogSeo({ ...episodes[0], postType: 'drama' }).kind, 'TVEpisode');
  assert.equal(buildCatalogSeo({ ...episodes[0], postType: 'دراما' }).kind, 'TVEpisode');
  assert.equal(buildCatalogSeo({ id: 'tv', title: 'Series', type: 'tv' }).kind, 'TVSeries');
});

test('imported markup and entities are plain text and URLs safely encode IDs', () => {
  assert.equal(plainSeoText('&amp;amp; &#x41; <script>alert(1)</script><b>Title</b>'), '& A Title');
  assert.equal(catalogMovieUrl('id&next=bad'), 'https://www.cinamachat.com/?movieId=id%26next%3Dbad');
  assert.equal(buildCatalogSeo({ id: 'x', title: 'X', image: 'javascript:alert(1)' }).image, 'https://www.cinamachat.com/pwa/icon-512.png');
});
