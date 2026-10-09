// Local-only production-build fixture; never changes the production database.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const movie = { id: 'manual-1999999999999', title: 'Player control fixture', type: 'movie', postType: 'فیلم', category: 'ئاکشن', tags: ['ئاکشن'], image: '', description: 'fixture', videoUrl: 'http://127.0.0.1:3039/test.mp4', date: '2026-10-09' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3039');
  if (url.pathname.startsWith('/api/') || url.pathname === '/catalog-fallback.json') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ results: [movie], count: 1 })); return;
  }
  const file = url.pathname === '/' ? '/index.html' : url.pathname;
  if (file.includes('..')) { res.writeHead(400).end(); return; }
  try {
    let body = await readFile(path.join(process.cwd(), 'dist', file));
    if (file === '/index.html' && url.searchParams.has('ios')) {
      // Exercise the iOS branch in a desktop test browser, not a real iPhone.
      body = Buffer.from(body.toString().replace('<head>', `<head><script>
        Object.defineProperty(navigator,'userAgent',{value:'iPhone Safari'});
        HTMLVideoElement.prototype.webkitEnterFullscreen=function(){this.webkitDisplayingFullscreen=true;window.__nativeFsCalls=(window.__nativeFsCalls||0)+1;};
        HTMLVideoElement.prototype.webkitExitFullscreen=function(){this.webkitDisplayingFullscreen=false;};
      </script>`));
    }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404).end(); }
}).listen(3039, '127.0.0.1', () => console.log('Player fixture: http://127.0.0.1:3039/?ios'));
