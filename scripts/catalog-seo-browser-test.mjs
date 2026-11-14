import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {MovieCard} from './src/components/Movie/MovieCard';
import {DramaEpisodeCard} from './src/components/Movie/DramaEpisodeCard';
window.actions={movie:0,episode:0,edit:0};
const movie={id:'film-test',title:'Film',year:'2024',image:'https://app.test/poster.png',posterUrl:'https://app.test/poster.png',tags:[]};
createRoot(document.getElementById('root')).render(<><MovieCard movie={movie} liveViewers={0} isTopLive={false} isFavorite={false} isLiked={false} likes={0} onOpen={()=>window.actions.movie++} onToggleFavorite={()=>{}} onToggleLike={()=>{}} onEdit={()=>window.actions.edit++}/>
<DramaEpisodeCard movie={{...movie,id:'episode-test',title:'Episode'}} order={0} onOpen={()=>window.actions.episode++} onEdit={()=>window.actions.edit++}/></>);` }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
 const page = await browser.newPage();
 await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<div style="width:300px" id="root"></div><script>${bundle.outputFiles[0].text}</script>` }));
 await page.goto('https://app.test/');
 const film = page.locator('a[href="https://www.cinamachat.com/?movieId=film-test"]');
 const episode = page.locator('a[href="https://www.cinamachat.com/?movieId=episode-test"]');
 await film.waitFor(); await episode.waitFor();
 await film.click();
 assert.equal(await page.evaluate(()=>window.actions.movie),1,'Title click opens only once');
 assert.equal(page.url(),'https://app.test/','Normal click preserves the current app');
 await page.getByRole('button',{name:'Edit Film',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.actions),{movie:1,episode:0,edit:1});
 await episode.click();
 await page.getByRole('button',{name:'Edit Episode',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.actions),{movie:1,episode:1,edit:2},'Episode editing does not start playback');
 const card = page.locator('[role="button"][aria-label^="Film"]');
 await card.focus(); await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>window.actions.movie),2,'Card keyboard behavior remains intact');
 console.log('PASS: crawlable movie/episode links preserve normal clicks, keyboard opening and isolated admin edits');
} finally { await browser.close(); }
