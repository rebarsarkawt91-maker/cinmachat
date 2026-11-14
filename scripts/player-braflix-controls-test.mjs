// Real component + cross-origin receiver. --live checks the actual provider.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const live = process.argv.includes('--live');
const source = 'https://braflix.dev/embed/tv/279246/1/1';
const bundled = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import Player from './src/components/Player/ImmersiveShieldedPlayer';
import {SceneBlurNotice} from './src/components/Player/SceneBlurNotice';
import {useSceneBlurPlayback} from './src/hooks/useSceneBlurPlayback';
import {providerCommandMessage,providerSeekMessage,readProviderPlaybackEvent} from './src/utils/playerControls';
const url=${JSON.stringify(source)};
function Fixture(){
 const [clock,setClock]=useState(null);
 const root=useRef(null);
 const active=useSceneBlurPlayback({config:{enabled:true,ranges:[{start:9,end:20}]},root,sourceUrl:url,currentTime:clock?.currentTime??0,duration:clock?.duration??0,playing:clock?.status==='playing',playbackRate:1,enabled:true});
 useEffect(()=>{const receive=e=>{const frame=document.querySelector('iframe');if(e.source!==frame?.contentWindow||e.origin!==new URL(url).origin)return;const report=readProviderPlaybackEvent(e.data);if(report)setClock(previous=>({...report,status:report.status??previous?.status??null}))};addEventListener('message',receive);return()=>removeEventListener('message',receive)},[]);
 const send=(command,value)=>document.querySelector('iframe')?.contentWindow?.postMessage(command==='seek'?providerSeekMessage(url,value):providerCommandMessage(url,command,value),new URL(url).origin);
 return <><div ref={root} style={{position:'relative',width:900,height:500}}><Player url={url} iframeId="streaming-player"/><SceneBlurNotice active={active}/></div>
 <button id="seek" onClick={()=>send('seek',30)}>Seek 30</button><button id="back" onClick={()=>send('seek',10)}>Seek 10</button>
 <button id="pause" onClick={()=>send('pauseVideo')}>Pause</button><button id="play" onClick={()=>send('playVideo')}>Play</button>
 <button id="mute" onClick={()=>send('mute')}>Mute</button><button id="unmute" onClick={()=>send('unMute')}>Unmute</button>
 <button id="volume" onClick={()=>send('volume',35)}>Volume 35</button><output id="clock">{JSON.stringify(clock)}</output></>;
}createRoot(document.getElementById('root')).render(<Fixture/>);` }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });

const receiver = `<body><button id="source-click">Source click</button><script>
window.currentTime=5;window.playing=true;window.muted=false;window.volume=100;window.commands=[];
function emit(event='time'){parent.postMessage({type:'PLAYER_EVENT',data:{event,currentTime,duration:600}},'*')}
// Exact upstream wire contract: intentionally DO NOT parse JSON strings.
addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='PLAYER_COMMAND')return;
 const {command,value}=event.data;commands.push(event.data);
 if(command==='seek')currentTime=Number(value);if(command==='play')playing=true;if(command==='pause')playing=false;
 if(command==='mute')muted=true;if(command==='unmute')muted=false;if(command==='volume')volume=value;
 emit(playing?'play':'pause');});
document.querySelector('button').onclick=()=>{window.popupBlocked=window.open('https://unwanted.test/')===null;try{top.location='https://unwanted.test/'}catch{window.topNavigationBlocked=true}};
emit();setInterval(()=>emit(playing?'play':'pause'),250);
</script>`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
 const page = await browser.newPage();
 let popups = 0;
 page.on('popup', () => popups++);
 await page.route('https://player-test.local/**', route => route.fulfill({ contentType: 'text/html', body: `<style>.absolute{position:absolute}.inset-0{inset:0}.w-full{width:100%}.h-full{height:100%}</style><div id="root"></div><script>${bundled.outputFiles[0].text}</script>` }));
 if (!live) await page.route('https://braflix.dev/**', route => route.fulfill({ contentType: 'text/html', body: receiver }));
 await page.goto('https://player-test.local/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(() => {const report=JSON.parse(document.querySelector('#clock').textContent);return report?.duration>0}, null, {timeout:live?90000:15000});
 const provider = page.frames().find(frame => frame.url().startsWith(source));
 assert.ok(provider);
 for (const token of ['allow-popups','allow-top-navigation','allow-top-navigation-by-user-activation']) {
  assert.ok(!(await page.locator('iframe').getAttribute('sandbox')).split(' ').includes(token));
 }
 if (!live) {
  await page.locator('#pause').click(); await provider.waitForFunction(()=>!window.playing);
  await page.locator('#play').click(); await provider.waitForFunction(()=>window.playing);
  await page.locator('#mute').click(); await provider.waitForFunction(()=>window.muted);
  await page.locator('#unmute').click(); await provider.waitForFunction(()=>!window.muted);
  await page.locator('#volume').click(); await provider.waitForFunction(()=>window.volume===35);
 } else {
  await page.locator('#pause').click();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#clock').textContent)?.status==='paused');
  await page.locator('#play').click();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#clock').textContent)?.status==='playing');
  await page.locator('#mute').click(); await provider.waitForFunction(()=>window.jwplayer?.().getMute()===true);
  await page.locator('#unmute').click(); await provider.waitForFunction(()=>window.jwplayer?.().getMute()===false);
  await page.locator('#volume').click(); await provider.waitForFunction(()=>window.jwplayer?.().getVolume()===35);
 }
 for (const [id,target] of [['seek',30],['back',10]]) {
  await page.locator('#'+id).click();
  await page.waitForFunction(target=>{const report=JSON.parse(document.querySelector('#clock').textContent);return Math.abs(report.currentTime-target)<3},target,{timeout:live?45000:10000});
  if (target===30) assert.equal(await page.getByTestId('scene-blur-notice').count(),0);
  else {
   await page.getByTestId('scene-blur-notice').waitFor();
   assert.match(await page.getByTestId('scene-blur-notice').innerText(),/خێزان و منداڵان/);
  }
 }
 await page.locator('#pause').click();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('#clock').textContent)?.status==='paused');
 assert.equal(await page.getByTestId('scene-blur-notice').count(),1,'Paused protected frame must stay concealed');
 await page.locator('#seek').click();
 await page.waitForFunction(()=>!document.querySelector('[data-testid="scene-blur-notice"]'));
 if (!live) {
  await provider.locator('#source-click').click();
  await provider.waitForFunction(()=>window.popupBlocked&&window.topNavigationBlocked);
  assert.equal(popups,0,'A trusted source click must not open another tab');
  assert.equal(page.url(),'https://player-test.local/','Source must not navigate CinemaChat away');
 } else {
  // Let the real source's click/ad handlers run with the browser sandbox active.
  await page.locator('iframe').click({position:{x:450,y:250}});
  assert.equal(popups,0,'Real source click must not open a popup tab');
  assert.equal(page.url(),'https://player-test.local/','Real source click must not navigate the parent');
 }
 console.log(JSON.stringify({mode:live?'live Braflix':'cross-origin receiver',controls:'passed',seekForwardAndBack:'passed',popupNavigation:live?'sandbox verified':'trusted click blocked',clock:await page.locator('#clock').textContent()}));
} finally { await browser.close(); }
