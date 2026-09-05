import http from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 4173);
const root = new URL('../', import.meta.url);
const statuses = ['wish', 'collect', 'do', 'on_hold', 'dropped'];
const media = ['anime', 'book', 'music', 'game', 'real'];

function pageShell() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bangumi 收藏作品年代测试</title><link rel="stylesheet" href="/dist/gadget.css">
  <style>body{margin:0;background:#f5f5f5;color:#555;font:12px Arial,sans-serif}.wrapperNeue{max-width:1100px;margin:auto;background:#fff;min-height:100vh;padding:18px}.nameSingle{color:#f09199}#user_home{width:68%;float:left}#columnB{width:30%;float:right}.section{min-height:100px;border-top:1px solid #eee;padding-top:10px}@media(max-width:640px){.wrapperNeue{padding:8px}#user_home{width:100%;float:none}#columnB{width:100%;float:none}}</style></head>
  <body><div class="wrapperNeue"><div id="dock"><ul><li class="first"><a href="/user/kazv">kazv</a></li></ul></div><h1 class="nameSingle">kazv <small>@kazv</small></h1><main id="user_home"><div class="user_box clearit">Bangumi 2020 加入</div><div id="anime" class="section sort">我的动画</div></main><aside id="columnB"></aside></div><script src="/dist/gadget.js"></script></body></html>`;
}

function collectionPage(pathname) {
  const parts = pathname.split('/');
  const type = parts[1];
  const status = parts[4];
  const typeIndex = media.indexOf(type);
  const statusIndex = statuses.indexOf(status);
  const start = 2001 + typeIndex * 3 + statusIndex;
  const rows = Array.from({ length: 3 }, (_, index) => {
    const id = 100000 + typeIndex * 100 + statusIndex * 10 + index;
    const year = start + index * 7;
    const date = type === 'anime' || type === 'real' ? `12话 / ${year}年4月4日 / Staff` : `${year}-04-04 / Creator`;
    return `<li id="item_${id}"><h3>测试作品 ${id}</h3><p class="info tip">${date}</p><p class="collectInfo">2026-1-1${index === 0 ? ' / 自己可见' : ''}</p></li>`;
  }).join('');
  return `<!doctype html><ul id="browserItemList">${rows}</ul><div class="page_inner"><strong class="p_cur">1</strong></div>`;
}

http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname === '/user/kazv') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(pageShell());
      return;
    }
    if (/^\/(anime|book|music|game|real)\/list\/kazv\/(wish|collect|do|on_hold|dropped)$/.test(url.pathname)) {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(collectionPage(url.pathname));
      return;
    }
    if (url.pathname === '/dist/gadget.js' || url.pathname === '/dist/gadget.css') {
      response.setHeader('content-type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
      response.end(await readFile(new URL(`..${url.pathname}`, import.meta.url)));
      return;
    }
    response.statusCode = 404;
    response.end('Not found');
  } catch (error) {
    response.statusCode = 500;
    response.end(String(error));
  }
}).listen(port, '127.0.0.1', () => console.log(`fixture server http://127.0.0.1:${port}/user/kazv`));
