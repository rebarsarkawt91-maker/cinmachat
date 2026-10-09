import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createYoutubePost, youtubePostId } from './youtubePost';
import { classifySourceType } from '../utils/sourceType';
test('YouTube posts support watch, short links, shorts, live and embed; reject other hosts and playlists', () => {
  const id = 'abcdefghijk';
  for (const url of [`https://youtu.be/${id}?t=3`, `https://www.youtube.com/watch?v=${id}`, `https://youtube.com/shorts/${id}`, `https://youtube.com/live/${id}`, `https://www.youtube-nocookie.com/embed/${id}`]) assert.equal(youtubePostId(url), id);
  for (const url of ['https://evil.test/watch?v=abcdefghijk', 'https://youtube.com.evil.test/embed/abcdefghijk', 'https://youtube.com/playlist?list=abcdefghijk', 'javascript:alert(1)', 'https://youtube.com/watch?v=abcdefghijkEXTRA']) assert.equal(youtubePostId(url), null);
  const post = createYoutubePost({ title: ' ڤیدیۆ ', url: `https://youtu.be/${id}`, description: 'زانیاری', category: 'کۆمیدی', poster: '', year: '2026', duration: '10:00' });
  assert.equal(post.title, 'ڤیدیۆ');
  assert.equal(post.description, 'زانیاری');
  assert.equal(post.videoUrl, `https://www.youtube.com/embed/${id}`);
  assert.equal(classifySourceType(post.videoUrl), 'youtube');
  assert.equal(post.posterUrl, `https://img.youtube.com/vi/${id}/hqdefault.jpg`);
  assert.equal(post.postType, 'YouTube');
});
