// Simple server for the demo. Counts are only kept in memory.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseBatch } from './collect.js';

const PORT = Number(process.env.PORT) || 8080;
const MAX_BODY = 64 * 1024;
const root = (file) => fileURLToPath(new URL(`../${file}`, import.meta.url));

const STATIC = {
  '/tracker.js': ['dist/beacon-tracker.min.js', 'text/javascript; charset=utf-8'],
  '/beacon-tracker.min.js.map': ['dist/beacon-tracker.min.js.map', 'application/json'],
  '/demo.js': ['demo/demo.js', 'text/javascript; charset=utf-8'],
  '/demo.css': ['demo/demo.css', 'text/css; charset=utf-8'],
};

const counts = new Map(); // "day|id|page|type" -> row

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

async function serveFile(res, file, type) {
  try {
    send(res, 200, await readFile(root(file)), type);
  } catch {
    const hint = file.startsWith('dist/') ? 'Not built yet: run `npm run build`.' : 'Not found';
    send(res, 404, hint);
  }
}

function collect(req, res) {
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) req.destroy();
    else chunks.push(chunk);
  });
  req.on('end', () => {
    const rows = parseBatch(Buffer.concat(chunks).toString('utf8'), req.headers['user-agent'] ?? '');
    for (const row of rows) {
      const key = `${row.day}|${row.id}|${row.page}|${row.type}`;
      const existing = counts.get(key);
      if (existing) existing.count += row.count;
      else counts.set(key, { ...row });
    }
    if (rows.length) console.log('collected', rows);
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
  });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && pathname === '/collect') return collect(req, res);
  if (req.method !== 'GET') return send(res, 405, 'Method not allowed');

  if (pathname === '/stats') {
    const rows = [...counts.values()].sort(
      (a, b) => a.id.localeCompare(b.id) || a.type.localeCompare(b.type) || a.page.localeCompare(b.page)
    );
    return send(res, 200, JSON.stringify(rows), 'application/json');
  }
  if (STATIC[pathname]) return serveFile(res, ...STATIC[pathname]);
  if (/\.[a-z0-9]+$/i.test(pathname)) return send(res, 404, 'Not found');
  return serveFile(res, 'demo/index.html', 'text/html; charset=utf-8');
});

server.listen(PORT, () => console.log(`demo: http://localhost:${PORT}`));
