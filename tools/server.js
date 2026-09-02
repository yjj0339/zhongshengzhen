/**
 * 沧海 · 本地静态服务器（零依赖）
 * 用法：node tools/server.js [端口]   默认 5173
 * 注意：手机浏览器要求安全上下文（HTTPS 或 localhost）才能使用 WebGPU，
 *       局域网 http 地址仅供预览页面结构，真机体验请使用 GitHub Pages 线上地址。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2]) || 5173;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let file = path.normalize(path.join(root, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404 Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => {
  console.log(`\n  沧海 · 本地预览已启动\n`);
  console.log(`  本机   http://localhost:${port}/`);
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list) {
      if (n.family === 'IPv4' && !n.internal) console.log(`  局域网 http://${n.address}:${port}/  （无 WebGPU 安全上下文，仅页面预览）`);
    }
  }
  console.log(`\n  手机完整体验请访问部署后的 GitHub Pages 地址（HTTPS）\n`);
});
