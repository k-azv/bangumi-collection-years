import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { createCache, CACHE_TTL } from '../src/cache.js';
const item = { subjectId:'1', media:'anime', status:'collect', year:2022 };
it('缓存隔离登录身份、目标用户、类别和状态，并在六小时后过期', () => {
  const storage = new JSDOM('', {url:'https://bgm.tv'}).window.localStorage;
  let time=1000;
  const own=createCache(storage,'kazv','kazv',()=>time);
  own.write('anime','collect',[item]);
  expect(own.read('anime','collect').fresh).toBe(true);
  expect(createCache(storage,null,'kazv').read('anime','collect')).toBeNull();
  expect(createCache(storage,'other','kazv').read('anime','collect')).toBeNull();
  expect(createCache(storage,'kazv','other').read('anime','collect')).toBeNull();
  expect(own.read('anime','do')).toBeNull();
  time += CACHE_TTL;
  expect(own.read('anime','collect')).toMatchObject({fresh:false,items:[item]});
  own.invalidate('anime');
  expect(own.read('anime','collect')).toBeNull();
});
it('存储损坏或被浏览器禁用时可以继续加载', () => {
  const cache=createCache(undefined,'kazv','kazv');
  expect(()=>cache.write('anime','collect',[item])).not.toThrow();
  expect(cache.read('anime','collect')).toBeNull();
  expect(()=>cache.invalidate('anime')).not.toThrow();
});
