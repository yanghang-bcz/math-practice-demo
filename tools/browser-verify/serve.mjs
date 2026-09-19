#!/usr/bin/env node

/* 极简静态服务器：只给浏览器验证用。
   不引外部依赖，Node 起得来就能跑（npm run 本身就在 Node 下）。 */

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const port = Number(process.argv[2] || 8899);
const root = path.resolve(process.argv[3] || process.cwd());

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.sql': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));

  if (!file.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(file);

    if (info.isDirectory()) {
      res.writeHead(404).end('Not found');
      return;
    }

    const body = await readFile(file);

    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });

    res.end(body);

  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`static server on http://127.0.0.1:${port} (root: ${root})`);
});
