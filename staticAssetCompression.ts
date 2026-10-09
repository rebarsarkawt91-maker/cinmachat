import path from 'node:path';
import { existsSync } from 'node:fs';
import type { RequestHandler } from 'express';

/** Serve only build-generated, flat immutable assets. Never APIs or HTML. */
export function compressedAssets(directory: string): RequestHandler {
  return (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || !/^\/[\w.-]+\.(js|css)$/.test(req.path)) return next();
    res.vary('Accept-Encoding');
    const encoding = req.acceptsEncodings('br', 'gzip', 'identity');
    if (encoding !== 'br' && encoding !== 'gzip') return next();
    const filename = path.resolve(directory, req.path.slice(1) + (encoding === 'br' ? '.br' : '.gz'));
    if (!existsSync(filename)) return next();
    res.setHeader('Content-Encoding', encoding);
    res.type(req.path.endsWith('.css') ? 'text/css' : 'application/javascript');
    res.sendFile(filename, { maxAge: '365d', immutable: true }, error => {
      if (error) {
        if (!res.headersSent) res.removeHeader('Content-Encoding');
        next(error);
      }
    });
  };
}
