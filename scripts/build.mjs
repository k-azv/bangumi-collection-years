import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

const banner = `// ==UserScript==
// @name         Bangumi 作品年份分布
// @namespace    https://github.com/k-azv/bangumi-collection-years
// @version      0.3.6
// @description  按作品发行年份查看动画、书籍、音乐、游戏与三次元收藏
// @author       k-azv
// @include      /^https?:\\/\\/(bgm\\.tv|bangumi\\.tv|chii\\.in)\\/user\\/[^/?#]+\\/?$/
// @include      /^https?:\\/\\/(bgm\\.tv|bangumi\\.tv|chii\\.in)\\/(anime|book|music|game|real)\\/list\\/[^/?#]+(?:\\/(wish|collect|do|on_hold|dropped))?\\/?(?:[?#].*)?$/
// ==/UserScript==`;

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/app.js'],
  outfile: 'dist/gadget.js',
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'none',
  banner: { js: banner },
});
await copyFile('src/style.css', 'dist/gadget.css');
