// 极简静态文件服务：把 pv-3d-demo 目录当网站根目录，只用 Node 内置模块。
// 用法：PORT=257 node deploy/serve.js（默认 8765，监听 0.0.0.0）
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8765;
const HOST = process.env.HOST || '0.0.0.0';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const HIDDEN = new Set(['deploy']);   // 部署脚本不对外
const cache = new Map();              // 文件 → { mtime, raw, gz }

const typeOf = (file) => TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

function load(file, st) {
  const hit = cache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit;
  const raw = fs.readFileSync(file);
  const zip = /^text\/|json|svg/.test(typeOf(file));
  const entry = { mtime: st.mtimeMs, raw, gz: zip ? zlib.gzipSync(raw, { level: 9 }) : null };
  cache.set(file, entry);
  return entry;
}

function send(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Bad Request');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, rel);
  const top = path.relative(ROOT, file).split(path.sep)[0];
  if (!file.startsWith(ROOT + path.sep) || top.startsWith('.') || HIDDEN.has(top)) return send(res, 404, 'Not Found');

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not Found');
    let entry;
    try {
      entry = load(file, st);
    } catch {
      return send(res, 500, 'Read Error');
    }
    const lastMod = new Date(Math.floor(st.mtimeMs / 1000) * 1000).toUTCString();
    const headers = {
      'Content-Type': typeOf(file),
      'Last-Modified': lastMod,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Accept-Encoding',
    };
    if (req.headers['if-modified-since'] === lastMod) {
      res.writeHead(304, headers);
      return res.end();
    }
    let body = entry.raw;
    if (entry.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      body = entry.gz;
      headers['Content-Encoding'] = 'gzip';
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  });
}).listen(PORT, HOST, () => console.log(`pv-3d-demo listening on http://${HOST}:${PORT}/ (root ${ROOT})`));
