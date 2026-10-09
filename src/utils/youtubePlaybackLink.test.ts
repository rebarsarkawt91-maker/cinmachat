import test from 'node:test';
import assert from 'node:assert/strict';
import { createYoutubePost, youtubePostId } from '../lib/youtubePost';
import { classifySourceType } from './sourceType';

test('posted share URL keeps the exact video ID and routes to the YouTube player', () => {
  const url = 'https://youtu.be/0P6B6nE45EQ?si=9lmbFO2KeaFNZRZi';
  assert.equal(youtubePostId(url), '0P6B6nE45EQ');
  const post = createYoutubePost({ url, title: 'YouTube fixture', description: '', poster: '', category: '', year: '', duration: '' });
  assert.equal(post.youtubeMovieUrl, 'https://www.youtube.com/embed/0P6B6nE45EQ');
  assert.equal(classifySourceType(post.videoUrl), 'youtube');
});
