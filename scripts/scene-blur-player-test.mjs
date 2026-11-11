// Offline integration: real media clocks and two independent viewer sessions.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';

await mkdir('artifacts/scene-blur', { recursive: true });
const mediaPath = 'artifacts/scene-blur/fixture.mp4';
if (!existsSync(mediaPath)) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'testsrc2=size=160x90:rate=12', '-t', '12', '-an', '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', mediaPath]);
}
const media = await readFile(mediaPath);
const webmPath = 'artifacts/scene-blur/fixture.webm';
if (!existsSync(webmPath)) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'testsrc2=size=160x90:rate=12', '-t', '12', '-an', '-c:v', 'libvpx',
    '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '160k', '-pix_fmt', 'yuv420p', '-y', webmPath]);
}
const webm = await readFile(webmPath);
const entry = `
import React,{useRef,useState,useEffect,useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {AdminSceneBlurButton} from './src/components/Player/AdminSceneBlurButton';
import {SceneBlurEditor} from './src/components/Player/SceneBlurEditor';
import {useMovieSceneBlur} from './src/hooks/useMovieSceneBlur';
import {useSceneBlurPlayback} from './src/hooks/useSceneBlurPlayback';
function Fixture(){
 const query=new URLSearchParams(location.search),admin=query.has('admin'),external=query.has('external');
 const [movie,setMovie]=useState('movie-a'),[open,setOpen]=useState(false);
 const [time,setTime]=useState(0),[duration,setDuration]=useState(0),[playing,setPlaying]=useState(false);
 const format=new URLSearchParams(location.search).get('format')==='webm'?'webm':'mp4';
 const root=useRef(null),source=external?'https://provider.test/embed/'+movie:'https://app.test/media/'+movie+'.'+format;
 const nativeSource=useMemo(()=>{const data=atob(window.sceneBlurTestMedia[format]);const bytes=Uint8Array.from(data,c=>c.charCodeAt(0));return URL.createObjectURL(new Blob([bytes],{type:'video/'+format}))},[movie,format]);
 useEffect(()=>()=>URL.revokeObjectURL(nativeSource),[nativeSource]);
 const {config,error,updateConfig}=useMovieSceneBlur({movieId:movie,initialConfig:null,enabled:true});
 const active=useSceneBlurPlayback({config,root,sourceUrl:source,currentTime:time,duration,playing,playbackRate:1,enabled:true});
 useEffect(()=>{setTime(0);setDuration(0);setPlaying(false);setOpen(false)},[movie]);
 useEffect(()=>{if(!external)return;const receive=event=>{setTime(event.detail.time);setDuration(event.detail.duration);setPlaying(event.detail.playing)};addEventListener('scene-blur-test-clock',receive);return()=>removeEventListener('scene-blur-test-clock',receive)},[external]);
 const save=async sceneBlur=>{const r=await fetch('/api/admin/movies/'+movie+'/scene-blur',{
  method:'PATCH',headers:{'Content-Type':'application/json','X-Admin-Username':'fixture-admin'},body:JSON.stringify({sceneBlur})});
  const d=await r.json();if(!r.ok||!d.success)throw Error('Save failed');updateConfig(d.sceneBlur);};
 return <main><output id="config">{JSON.stringify(config)}</output>
 <div ref={root} data-movie={movie} style={{position:'relative',width:'100%',height:'650px',background:'black',color:'white'}}>
  <div data-testid="media" data-blurred={active?'true':'false'} style={{position:'absolute',inset:0,filter:active?'blur(40px) brightness(0.2)':undefined}}>
   {external?<iframe title="Clock fixture" src={source} style={{width:'100%',height:'100%'}}/>:<video key={movie} id="film" src={nativeSource} muted playsInline preload="auto" style={{width:'100%',height:'100%',objectFit:'contain'}}
    onLoadedMetadata={e=>setDuration(e.currentTarget.duration)} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)}
    onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}/>}
  </div>
  <div data-testid="subtitle" style={{position:'absolute',bottom:'90px',zIndex:50}}>ژێرنووسی کوردی</div>
  <div data-testid="toolbar" style={{position:'absolute',bottom:0,zIndex:60}}>
   <AdminSceneBlurButton canAdminister={admin} active={config.enabled} expanded={open} onToggle={()=>setOpen(v=>!v)}/>
   <button id="switch" onClick={()=>setMovie(v=>v==='movie-a'?'movie-b':'movie-a')}>Another movie</button>
  </div>
  {admin&&open&&<SceneBlurEditor movieId={movie} config={config} currentTime={time} approximateClock={false} syncError={error} onSave={save} onClose={()=>setOpen(false)}/>}
 </div></main>;
}createRoot(document.querySelector('#root')).render(<Fixture/>);`;
const bundled = await build({ stdin: { contents: entry, loader: 'jsx', resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' } });
const js = bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const assets = await readdir('dist/assets');
const cssName = assets.find(name => /^index-.*\.css$/.test(name));
assert.ok(cssName, 'Build production CSS before running this test');
const css = await readFile(`dist/assets/${cssName}`, 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));

const selectedEngine = process.argv.find(argument => argument.startsWith('--engine='))?.split('=')[1];
assert.ok(!selectedEngine || ['chromium', 'webkit'].includes(selectedEngine), 'Choose --engine=chromium or --engine=webkit');
const iframeOnly = process.argv.includes('--iframe-only');
for (const engine of [chromium, webkit].filter(engine => !selectedEngine || engine.name() === selectedEngine)) {
  const saved = new Map([
    ['movie-a', { enabled: true, ranges: [{ start: 2, end: 4 }] }],
    ['movie-b', { enabled: false, ranges: [] }],
  ]);
  let writes = 0;
  const browser = await engine.launch();
  const errors = [];
  const contexts = [];
  try {
    for (const admin of [true, false]) {
      const context = await browser.newContext({ viewport: admin ? { width: 390, height: 844 } : { width: 700, height: 820 }, hasTouch: true });
      contexts.push(context);
      await context.route('**/*', route => route.abort());
      await context.route('https://provider.test/**', route => route.fulfill({ contentType: 'text/html',
        body: '<body style="background:black;color:white">Native verification remains readable<button>Start</button></body>' }));
      await context.route('https://app.test/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const match = url.pathname.match(/^\/api\/(admin\/)?movies\/([^/]+)\/scene-blur$/);
        if (match) {
          const movieId = decodeURIComponent(match[2]);
          if (request.method() === 'PATCH') {
            if (!admin || request.headers()['x-admin-username'] !== 'fixture-admin') {
              return route.fulfill({ status: 403, json: { success: false } });
            }
            saved.set(movieId, copy(request.postDataJSON().sceneBlur));
            writes++;
          }
          return route.fulfill({ json: { success: true, movieId, sceneBlur: copy(saved.get(movieId)) } });
        }
        if (url.pathname.startsWith('/media/')) {
          const bytes = url.pathname.endsWith('.webm') ? webm : media;
          const range = request.headers().range?.match(/bytes=(\d+)-(\d*)/);
          const headers = { 'content-type': url.pathname.endsWith('.webm') ? 'video/webm' : 'video/mp4', 'accept-ranges': 'bytes' };
          if (!range) return route.fulfill({ status: 200, headers: { ...headers, 'content-length': String(bytes.length) }, body: bytes });
          const start = Number(range[1]);
          const end = Math.min(range[2] ? Number(range[2]) : bytes.length - 1, bytes.length - 1);
          return route.fulfill({ status: 206, headers: { ...headers,
            'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': String(end - start + 1) }, body: bytes.subarray(start, end + 1) });
        }
        return route.fulfill({ contentType: 'text/html', body: `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>window.sceneBlurTestMedia=${JSON.stringify({mp4:media.toString('base64'),webm:webm.toString('base64')})}</script><script>${js}</script>` });
      });
    }
    const framePage = await contexts[1].newPage();
    framePage.on('pageerror', error => errors.push(error.message));
    await framePage.goto('https://app.test/?external=1');
    await framePage.locator('#config').waitFor();
    await framePage.waitForFunction(() => JSON.parse(document.querySelector('#config').textContent).ranges[0]?.start === 2);
    assert.equal(await framePage.getByTestId('media').getAttribute('data-blurred'), 'false', 'Missing iframe metadata must leave native verification readable');
    const clockReport = async (time, playing = false) => {
      await framePage.evaluate(report => dispatchEvent(new CustomEvent('scene-blur-test-clock', { detail: report })), { time, duration: 12, playing });
    };
    const expectMask = active => framePage.waitForFunction(active => document.querySelector('[data-testid="media"]').dataset.blurred === String(active), active);
    await clockReport(1);
    await expectMask(true); // Conservative 1s leading window before 2s range.
    await clockReport(3);
    await expectMask(true);
    await clockReport(4.1);
    await expectMask(false); // Only a fresh beyond-end report clears the mask.
    await clockReport(5, true);
    await expectMask(false);
    await expectMask(true); // A stale playing clock (>6s) fails closed.
    await clockReport(5.2);
    await expectMask(false);
    await clockReport(2.5);
    await expectMask(true);
    await framePage.locator('#switch').click();
    await framePage.waitForSelector('[data-movie="movie-b"]');
    assert.equal(await framePage.getByTestId('media').getAttribute('data-blurred'), 'false', 'Iframe source reset cannot carry an earlier movie mask');
    await framePage.close();
    assert.deepEqual(errors, [], 'Iframe masking integration must not throw page errors');
    console.log(`PASS ${engine.name()}: iframe clock verification readability, early range mask, end confirmation, stale-clock protection and source reset`);
    if (iframeOnly) {
      const reason = engine.name() === 'webkit' && process.platform === 'win32'
        ? '; this Windows WebKit fixture previously returned MEDIA_ERR_SRC_NOT_SUPPORTED for MP4 and VP8, including Blob media' : '';
      console.log(`SKIP ${engine.name()} native media/UI suite: --iframe-only selected${reason}.`);
      continue;
    }
    const [adminPage, viewer] = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of [adminPage, viewer]) page.on('pageerror', error => errors.push(error.message));
    const format = engine.name() === 'webkit' ? 'webm' : 'mp4';
    await Promise.all([adminPage.goto(`https://app.test/?admin=1&format=${format}`), viewer.goto(`https://app.test/?format=${format}`)]);
    const loaded = async page => {
      try {
        await page.waitForFunction(() => {
          const video = document.querySelector('#film');
          return video?.readyState >= 1 && video.duration > 10;
        }, undefined, { timeout: 12_000 });
      } catch {
        const details = await page.locator('#film').evaluate(video => ({
          readyState: video.readyState, networkState: video.networkState, duration: video.duration,
          error: video.error && { code: video.error.code, message: video.error.message },
          mp4: video.canPlayType('video/mp4; codecs="avc1.42E01E"'), webm: video.canPlayType('video/webm; codecs="vp8"'),
        }));
        throw Object.assign(new Error(`${engine.name()} native fixture did not load: ${JSON.stringify({ ...details, pageErrors: errors })}`), {
          unsupportedMedia: details.error?.code === 4,
        });
      }
    };
    try {
      await Promise.all([loaded(adminPage), loaded(viewer)]);
    } catch (error) {
      if (engine.name() === 'webkit' && process.platform === 'win32' && error.unsupportedMedia) {
        console.log(`SKIP webkit native media/UI suite: Windows fixture decoding unavailable. ${error.message}`);
        continue;
      }
      throw error;
    }
    const expectConfig = (page, check, argument) => page.waitForFunction(({ check, argument }) => {
      const value = JSON.parse(document.querySelector('#config').textContent);
      return check === 'range' ? value.ranges[0]?.start === argument : value.enabled === argument;
    }, { check, argument }, { timeout: 12_000 });
    await expectConfig(viewer, 'range', 2);
    await expectConfig(adminPage, 'range', 2);
    assert.equal(await adminPage.getByTestId('admin-scene-blur').count(), 1);
    assert.equal(await viewer.getByTestId('admin-scene-blur').count(), 0, 'Viewers must not receive the editing button');
    assert.equal(await viewer.locator('#scene-blur-editor').count(), 0);

    const seek = async (page, time, blurred) => {
      await page.locator('#film').evaluate((video, time) => { video.pause(); video.currentTime = time; }, time);
      await page.waitForFunction(time => Math.abs(document.querySelector('#film').currentTime - time) < .01, time);
      await page.getByTestId('media').filter({ has: page.locator('#film') }).waitFor();
      await page.waitForFunction(blurred => document.querySelector('[data-testid="media"]').dataset.blurred === String(blurred), blurred);
    };
    await seek(viewer, 1.5, false);
    await viewer.locator('#film').evaluate(video => video.play());
    await viewer.waitForFunction(() => document.querySelector('[data-testid="media"]').dataset.blurred === 'true');
    await viewer.locator('#film').evaluate(video => video.pause());
    await seek(viewer, 3, true);
    await seek(adminPage, 3, true);
    const layers = await viewer.evaluate(() => {
      const filters = selector => {
        let element = document.querySelector(selector); const values = [];
        while (element) { const filter = getComputedStyle(element).filter; if (filter !== 'none') values.push(filter); element = element.parentElement; }
        return values;
      };
      return { media: filters('[data-testid="media"]'), toolbar: filters('[data-testid="toolbar"]'), subtitle: filters('[data-testid="subtitle"]') };
    });
    assert.ok(layers.media.some(filter => filter.includes('blur(40px)')));
    assert.deepEqual(layers.toolbar, [], 'Toolbar must remain outside the filtered media subtree');
    assert.deepEqual(layers.subtitle, [], 'Subtitles must remain outside the filtered media subtree');
    const paused = await viewer.locator('#film').evaluate(video => new Promise(resolve => {
      const before = video.currentTime; let frames = 0;
      const tick = () => { if (++frames === 12) resolve({ before, after: video.currentTime, paused: video.paused }); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }));
    assert.equal(paused.paused, true);
    assert.equal(paused.after, paused.before, 'A paused native media clock must not drift with wall time');
    await seek(viewer, 4.5, false);
    await seek(viewer, 6, false);

    let screenshotTaken = false;
    const edit = async change => {
      const before = await adminPage.locator('#film').evaluate(video => ({ time: video.currentTime, src: video.currentSrc }));
      await adminPage.getByTestId('admin-scene-blur').click();
      const panel = adminPage.locator('#scene-blur-editor');
      await panel.waitFor();
      await change(panel);
      if (!screenshotTaken && engine.name() === 'chromium') {
        const style = await adminPage.addStyleTag({ content: '#config, #switch { visibility:hidden !important; }' });
        await adminPage.screenshot({ path: 'artifacts/scene-blur/admin-panel.png' });
        await style.evaluate(element => element.remove());
        screenshotTaken = true;
      }
      const previousWrites = writes;
      await panel.getByRole('button', { name: 'پاشەکەوتکردن بۆ هەموو بینەران', exact: true }).click();
      await panel.waitFor({ state: 'detached' });
      assert.equal(writes, previousWrites + 1);
      const after = await adminPage.locator('#film').evaluate(video => ({ time: video.currentTime, src: video.currentSrc }));
      assert.equal(after.src, before.src, 'Saving blur settings must not replace the playing source');
      assert.ok(Math.abs(after.time - before.time) < .01, 'Saving ranges/master switch must not reset paused media time');
    };
    await edit(async panel => {
      await panel.locator('input[dir="ltr"]').nth(0).fill('٠٠:٠٥');
      await panel.locator('input[dir="ltr"]').nth(1).fill('00:07');
    });
    assert.deepEqual(saved.get('movie-a'), { enabled: true, ranges: [{ start: 5, end: 7 }] });
    await expectConfig(viewer, 'range', 5);
    await viewer.waitForFunction(() => document.querySelector('[data-testid="media"]').dataset.blurred === 'true');
    await edit(panel => panel.getByRole('checkbox').uncheck());
    await expectConfig(viewer, 'enabled', false);
    assert.equal(await viewer.getByTestId('media').getAttribute('data-blurred'), 'false');
    await viewer.reload();
    await loaded(viewer);
    await expectConfig(viewer, 'range', 5);
    await expectConfig(viewer, 'enabled', false);
    await seek(viewer, 6, false);
    await edit(panel => panel.getByRole('checkbox').check());
    await expectConfig(viewer, 'enabled', true);
    await viewer.waitForFunction(() => document.querySelector('[data-testid="media"]').dataset.blurred === 'true');
    await viewer.locator('#switch').click();
    await viewer.waitForSelector('[data-movie="movie-b"]');
    assert.equal(await viewer.getByTestId('media').getAttribute('data-blurred'), 'false', 'New source cannot inherit the previous movie mask');
    await loaded(viewer);
    await expectConfig(viewer, 'enabled', false);
    assert.deepEqual(errors, [], 'Player integration must not throw page errors');
    console.log(`PASS ${engine.name()}: admin-only timing editor, shared viewer sync, native seek/pause, clear controls/subtitles, reload and source reset`);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    await browser.close();
  }
}
