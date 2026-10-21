import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DramaEpisodeCard } from './DramaEpisodeCard';

const movie = { id: 'episode-2', title: 'Episode 2', image: '', quality: 'HD', description: '', whatsappLink: '', tags: ['drama'], date: '' };
test('guest drama cards contain only playback; admins get a separate accessible edit button', () => {
  const guest = renderToStaticMarkup(<DramaEpisodeCard movie={movie} order={1} onOpen={() => {}} />);
  const admin = renderToStaticMarkup(<DramaEpisodeCard movie={movie} order={1} onOpen={() => {}} onEdit={() => {}} />);
  assert.equal((guest.match(/<button/g) || []).length, 1);
  assert.equal((admin.match(/<button/g) || []).length, 2);
  assert.ok(!guest.includes('EDIT'));
  assert.ok(admin.includes('aria-label="Edit Episode 2"'));
  assert.ok(admin.includes('Drama 2'));
  assert.ok(!/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/.test(admin), 'buttons must not nest');
});
