// Exercise the real React player against an isolated provider protocol fixture.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';

const entry = `import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Player from './src/components/Player/ImmersiveShieldedPlayer';
import {providerAction} from './src/utils/playerControls';
function Fixture(){
 const [off,setOff]=useState(true),[playing,setPlaying]=useState(true),[muted,setMuted]=useState(false);
 const send=command=>document.querySelector('#streaming-player').contentWindow.postMessage(JSON.stringify({player:true,action:providerAction(command)}),'https://proxy.garageband.rocks');
 return <div className="relative h-screen w-full"><Player url="https://proxy.garageband.rocks/embed/movie/tt27613895" iframeId="streaming-player" hideNativeSubtitles={off} playback={{currentTime:5,playing,muted}}/>
 <div id="glass" className="absolute inset-0 z-[42]"/>
 <div style={{position:'absolute',bottom:0,zIndex:60}}>
 <button id="pause" onClick={()=>{setPlaying(false);send('pauseVideo')}}>Pause</button>
 <button id="play" onClick={()=>{setPlaying(true);send('playVideo')}}>Play</button>
 <button id="mute" onClick={()=>{setMuted(true);send('mute')}}>Mute</button>
 <button id="unmute" onClick={()=>{setMuted(false);send('unMute')}}>Unmute</button>
 <button id="seek" onClick={()=>send('seek30')}>Seek</button>
 <button id="cc" onClick={()=>setOff(v=>!v)}>CC English</button>
 </div></div>;
}createRoot(document.querySelector('#root')).render(<Fixture/>);`;
const bundled = await build({ stdin: { contents: entry, loader: 'jsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
const js = bundled.outputFiles[0].text;
const assets = await readdir('dist/assets');
const css = await readFile(`dist/assets/${assets.find(f => /^index-.*\.css$/.test(f))}`, 'utf8');
const blank = await readFile('public/player-captions-off.vtt', 'utf8');
const source = await readFile('src/App.tsx', 'utf8');
assert.match(source, /data-testid="player-interaction-layer"\s+className="absolute inset-0 z-\[42\] cursor-default"/);

for (const engine of [chromium, webkit]) {
 const browser = await engine.launch();
 try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.route('**/*', route => route.abort());
  await page.route('https://app.test/**', route => {
   if (route.request().url().endsWith('/player-captions-off.vtt')) return route.fulfill({ contentType: 'text/vtt', headers: { 'Access-Control-Allow-Origin': '*' }, body: blank });
   return route.fulfill({ contentType: 'text/html', body: `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${js}</script>` });
  });
  await page.route('https://proxy.garageband.rocks/**', route => route.fulfill({ contentType: 'text/html', body: `
   <body style="margin:0;background:black;color:white"><div id="caption"></div><script>
   const params=new URLSearchParams(location.search);
   window.current=Number(params.get('startAt')||5);window.playing=params.get('autoplay')!=='0';window.muted=false;window.adClicks=0;
   function emit(){parent.postMessage({type:'PLAYER_EVENT',data:{player_progress:current,player_duration:600,player_status:playing?'playing':'paused'}},'*')}
   document.addEventListener('pointerdown',()=>{adClicks++;window.open('https://ad.test/')});
   addEventListener('message',e=>{let m=e.data;try{if(typeof m==='string')m=JSON.parse(m)}catch{return}if(!m.player)return;
    if(m.action==='play')playing=true;if(m.action==='pause')playing=false;
    if(m.action==='mute')muted=true;if(m.action==='unmute')muted=false;
    if(/^seek\\d+$/.test(m.action))current=Number(m.action.slice(4));emit();});
   if(params.has('sub_url'))fetch(params.get('sub_url')).then(r=>r.text()).then(t=>{document.querySelector('#caption').textContent=t.includes('WEBVTT')?'':'fetch failed';window.captionsReady=true});
   else{document.querySelector('#caption').textContent='Original English';window.captionsReady=true}
   parent.postMessage({type:'PLAYER_TITLE',title:'Fixture'},'*');emit();
   setInterval(()=>{if(playing)current++;emit()},1000);
   </script>` }));
  await page.goto('https://app.test/');
  await page.locator('#streaming-player').waitFor();
  const provider = () => page.frames().find(f => f.url().startsWith('https://proxy.garageband.rocks/embed/'));
  await page.waitForFunction(() => !!document.querySelector('#streaming-player')?.contentWindow);
  await provider().waitForFunction(() => window.captionsReady);
  assert.equal(await provider().locator('#caption').innerText(), '', 'English off must not show a caption');
  await page.touchscreen.tap(180,250);
  assert.equal(await provider().evaluate(() => window.adClicks), 0, 'Protected surface must not activate source click ads');
  for (const [id, property, expected] of [['pause','playing',false],['play','playing',true],['mute','muted',true],['unmute','muted',false],['seek','current',30]]) {
   await page.locator('#'+id).tap();
   await provider().waitForFunction(({ property, expected })=>window[property]===expected,{property,expected});
  }
  await page.locator('#pause').tap();
  await provider().waitForFunction(()=>!playing);
  await page.locator('#cc').tap();
  await page.waitForFunction(()=>new URL(document.querySelector('#streaming-player').src).searchParams.get('ds_lang')==='en');
  await provider().waitForFunction(()=>window.captionsReady);
  assert.equal(await provider().locator('#caption').innerText(),'Original English');
  assert.equal(await provider().evaluate(()=>playing),false,'Caption reload must preserve pause');
  assert.ok(await provider().evaluate(()=>current)>=30,'Caption reload must not return to the beginning');
  await page.locator('#cc').tap();
  await page.waitForFunction(()=>new URL(document.querySelector('#streaming-player').src).searchParams.has('sub_url'));
  await provider().waitForFunction(()=>window.captionsReady);
  assert.equal(await provider().locator('#caption').innerText(),'');
  assert.equal(page.context().pages().length,1);
  console.log('PASS '+engine.name()+': real protected player blocks source touches; relay controls and caption off/on preserve playback');
 } finally {await browser.close()}
}
