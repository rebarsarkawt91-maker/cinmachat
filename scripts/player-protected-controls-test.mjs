// Exercise the real React player against an isolated provider protocol fixture.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';

const entry = `import React,{useState,useEffect,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import Player from './src/components/Player/ImmersiveShieldedPlayer';
import {PlayerInteractionLayer} from './src/components/Player/PlayerInteractionLayer';
import {providerAction,readProviderPlaybackEvent} from './src/utils/playerControls';
function Fixture(){
 const source=new URLSearchParams(location.search).has('other')?'https://other-provider.test/embed/fixture':'https://proxy.garageband.rocks/embed/movie/tt27613895';
 const [off,setOff]=useState(true),[playing,setPlaying]=useState(true),[muted,setMuted]=useState(false),[requestedPlaying,setRequested]=useState(undefined),[ready,setReady]=useState(false),[currentTime,setCurrentTime]=useState(5);
 const onReady=useCallback(value=>{setReady(value);if(!value)setPlaying(false)},[]);
 useEffect(()=>{const receive=e=>{const frame=document.querySelector('#streaming-player');if(e.source!==frame?.contentWindow||e.origin!==new URL(frame.src).origin)return;const report=readProviderPlaybackEvent(e.data);if(!report)return;setCurrentTime(report.currentTime);const s=report.status;if(s==='playing'||s==='paused'){const next=s==='playing';setPlaying(next);setRequested(previous=>previous===next?undefined:previous)}};addEventListener('message',receive);return()=>removeEventListener('message',receive)},[]);
 const send=command=>document.querySelector('#streaming-player').contentWindow.postMessage(JSON.stringify({player:true,action:providerAction(command)}),new URL(source).origin);
 return <div className="relative h-screen w-full"><Player url={source} iframeId="streaming-player" hideNativeSubtitles={off} onPlaybackReady={onReady} playback={{currentTime,playing,muted,requestedPlaying}}/>
 <PlayerInteractionLayer url={source}/>
 <output id="ready" style={{position:'absolute',top:0,zIndex:60,pointerEvents:'none'}}>{ready?'ready':'waiting'}</output>
 <div style={{position:'absolute',bottom:0,zIndex:60}}>
 <button id="pause" onClick={()=>{setRequested(false);setPlaying(false);send('pauseVideo')}}>Pause</button>
 <button id="play" onClick={()=>{setRequested(true);setPlaying(true);send('playVideo')}}>Play</button>
 <button id="mute" onClick={()=>{setMuted(true);send('mute')}}>Mute</button>
 <button id="unmute" onClick={()=>{setMuted(false);send('unMute')}}>Unmute</button>
 <button id="seek" onClick={()=>send('seek30')}>Seek</button>
 <button id="cc" onClick={()=>setOff(v=>!v)}>CC English</button>
 </div></div>;
}createRoot(document.querySelector('#root')).render(<Fixture/>);`;
const bundled = await build({ stdin: { contents: entry, loader: 'jsx', resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const js = bundled.outputFiles[0].text;
const assets = await readdir('dist/assets');
const css = await readFile(`dist/assets/${assets.find(f => /^index-.*\.css$/.test(f))}`, 'utf8');
const blank = await readFile('public/player-captions-off.vtt', 'utf8');

for (const engine of [chromium, webkit]) {
 const browser = await engine.launch();
 try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.route('**/*', route => route.abort());
  await page.route('https://app.test/**', route => {
   if (route.request().url().endsWith('/player-captions-off.vtt')) return route.fulfill({ contentType: 'text/vtt', headers: { 'Access-Control-Allow-Origin': '*' }, body: blank });
   return route.fulfill({ contentType: 'text/html', body: `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${js}</script>` });
  });
  const providerDocument = `
   <body style="margin:0;background:black;color:white"><div id="caption"></div><button id="native-start" style="position:absolute;left:80px;top:220px;width:220px;height:64px">Continue to native player</button><script>
   const params=new URLSearchParams(location.search);
   window.current=Number(params.get('startAt')||5);window.playing=params.get('autoplay')!=='0';window.muted=false;window.providerReady=false;window.nativeActivations=0;window.sourceTouches=0;window.receivedCommands=[];
   function emit(){parent.postMessage({type:'PLAYER_EVENT',data:{player_progress:current,player_duration:providerReady?600:0,player_status:playing?'playing':'paused'}},'*')}
   document.addEventListener('pointerdown',()=>sourceTouches++);
   addEventListener('message',e=>{let m=e.data;try{if(typeof m==='string')m=JSON.parse(m)}catch{return}if(!m.player)return;receivedCommands.push(m.action);if(!providerReady)return;
    if(m.action==='play')playing=true;if(m.action==='pause')playing=false;
    if(m.action==='mute')muted=true;if(m.action==='unmute')muted=false;
    if(/^seek\\d+$/.test(m.action))current=Number(m.action.slice(4));emit();});
   if(params.has('sub_url'))fetch(params.get('sub_url')).then(r=>r.text()).then(t=>{document.querySelector('#caption').textContent=t.includes('WEBVTT')?'':'fetch failed';window.captionsReady=true});
   else{document.querySelector('#caption').textContent='Original English';window.captionsReady=true}
   // A real pointer activation stands in for the provider's native Continue
   // gate. No CAPTCHA is automated or bypassed by this isolated fixture.
   document.querySelector('#native-start').addEventListener('click',event=>{if(!event.isTrusted)return;nativeActivations++;providerReady=true;event.currentTarget.hidden=true;emit()});
   parent.postMessage({type:'PLAYER_TITLE',title:'Fixture'},'*');emit();
   setInterval(()=>{if(playing&&providerReady)current++;if(providerReady)emit()},1000);
   </script>`;
  await page.route('https://proxy.garageband.rocks/**', route => route.fulfill({ contentType: 'text/html', body: providerDocument }));
  await page.route('https://other-provider.test/**', route => route.fulfill({ contentType: 'text/html', body: providerDocument }));
  await page.goto('https://app.test/');
  await page.locator('#streaming-player').waitFor();
  const provider = () => page.frames().find(f => f.url().startsWith('https://proxy.garageband.rocks/embed/'));
  await page.waitForFunction(() => !!document.querySelector('#streaming-player')?.contentWindow);
  await provider().waitForFunction(() => window.captionsReady);
  assert.equal(await page.getByTestId('player-interaction-layer').count(),0,'Known interactive source must not be covered by the parent glass');
  assert.equal(await page.locator('#ready').innerText(),'waiting','Title and duration-zero reports must leave the provider waiting');
  assert.equal(await provider().evaluate(()=>providerReady),false,'Fixture must require native input before positive media metadata');
  assert.deepEqual(await provider().evaluate(()=>receivedCommands),[],'Title and loading reports must not trigger playback restoration');
  await provider().locator('#native-start').tap();
  await page.locator('#ready').filter({hasText:'ready'}).waitFor();
  await provider().waitForFunction(() => window.providerReady && window.receivedCommands.includes('play'));
  assert.equal(await provider().evaluate(()=>nativeActivations),1,'Native gate must receive a real trusted click');
  assert.ok(await provider().evaluate(()=>sourceTouches)>0,'Known provider must receive direct pointer input');
  assert.equal(await provider().locator('#caption').innerText(), '', 'English off must not show a caption');
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
  for (const enabled of [false, true]) {
   await page.locator('#cc').tap();
   await page.waitForFunction(enabled=>new URL(document.querySelector('#streaming-player').src).searchParams.has('ds_lang')===enabled,enabled);
   await provider().waitForFunction(()=>window.captionsReady);
   assert.ok(await provider().evaluate(()=>current)>=30,'Rapid caption toggles during loading must retain the pending resume time');
  }
  // A user can change their mind while the replacement frame is loading.
  // Its handler deliberately ignores these early commands; the real component
  // must replay the latest choices after metadata arrives.
  await page.locator('#play').tap();
  await page.locator('#unmute').tap();
  assert.equal(await provider().evaluate(()=>playing),false,'Fixture must still be waiting for metadata');
  await provider().locator('#native-start').tap();
  await provider().waitForFunction(()=>playing && !muted);
  await page.locator('#pause').tap();
  await provider().waitForFunction(()=>!playing);
  await page.locator('#cc').tap();
  await page.waitForFunction(()=>new URL(document.querySelector('#streaming-player').src).searchParams.has('sub_url'));
  await provider().waitForFunction(()=>window.captionsReady);
  // An early autoplay report must not override the user's queued pause.
  await provider().evaluate(()=>{playing=true;parent.postMessage({type:'PLAYER_EVENT',data:{player_progress:current,player_duration:0,player_status:'playing'}},'*')});
  assert.equal(await page.locator('#ready').innerText(),'waiting','Loading autoplay cannot assert media readiness');
  await provider().locator('#native-start').tap();
  await provider().waitForFunction(()=>!playing);
  assert.equal(await provider().locator('#caption').innerText(),'');
  // Other embedded providers keep the original parent shield. The exemption
  // must not silently expose every iframe to source interactions.
  await page.goto('https://app.test/?other=1');
  await page.getByTestId('player-interaction-layer').waitFor();
  const other = page.frames().find(frame=>frame.url().startsWith('https://other-provider.test/embed/'));
  await other.locator('#native-start').waitFor();
  await page.touchscreen.tap(180,250);
  assert.equal(await other.evaluate(()=>sourceTouches),0,'Unknown provider must retain its click shield');
  assert.equal(await other.evaluate(()=>nativeActivations),0,'Unknown provider native gate must remain behind its shield');
  console.log('PASS '+engine.name()+': known provider native interaction reaches verification gate; validated media readiness, relay controls and caption reloads preserve playback; other providers retain the shield');
 } finally {await browser.close()}
}
