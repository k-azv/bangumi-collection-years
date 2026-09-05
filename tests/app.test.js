import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

let dom;
afterEach(() => { dom?.window.close(); vi.unstubAllGlobals(); });
it('游戏在玩页自动在侧栏展示当前状态的年份分布', async () => {
  dom = new JSDOM(`<div id="dock"><li class="first"><a href="/user/kazv">kazv</a></li></div>
    <div id="columnSubjectBrowserA"><ul id="browserItemList"></ul></div><div id="columnSubjectBrowserB"></div>`,
  { url: 'https://bgm.tv/game/list/kazv/do', runScripts: 'outside-only' });
  const fetcher = vi.fn(async () => ({ok:true, text:async()=>`<ul id="browserItemList">
    <li id="item_1"><h3><a href="/subject/1">Harmonia</a></h3><p class="info tip">2016年9月23日 / PC</p></li>
    <li id="item_2"><h3><a href="/subject/2">炽焰天穹</a></h3><p class="info tip">2022-02-10 / PC</p></li></ul>`}));
  dom.window.fetch = fetcher;
  dom.window.eval(readFileSync('dist/gadget.js', 'utf8'));
  await vi.waitFor(() => {
    expect(dom.window.document.querySelector('#columnSubjectBrowserB #bgm-collection-years')).not.toBeNull();
    expect(dom.window.document.querySelector('.bgmcy-summary')?.textContent).toContain('2');
  });
  expect(fetcher.mock.calls.map(c=>new URL(c[0]).pathname)).toEqual(['/game/list/kazv/do']);
  expect(dom.window.document.querySelector('[aria-label="收藏状态"]').value).toBe('do');
  expect([...dom.window.document.querySelectorAll('.bgmcy-count')].map(e=>e.textContent)).toEqual(['1','1']);
  expect([...dom.window.document.querySelectorAll('.bgmcy-percent')].map(e=>e.textContent)).toEqual(['50%','50%']);
});
it('打开页面复用缓存，切换状态只加载选中的状态', async () => {
  dom=new JSDOM('<div id="dock"><li class="first"><a href="/user/kazv">kazv</a></li></div><div id="columnSubjectBrowserA"></div><div id="columnSubjectBrowserB"></div>',{url:'https://bgm.tv/game/list/kazv/do',runScripts:'outside-only'});
  dom.window.localStorage.setItem('bgmcy:v2:kazv:kazv:game:do',JSON.stringify({at:Date.now(),items:[{subjectId:'1',media:'game',status:'do',year:2016}]}));
  const fetcher=vi.fn(async()=>({ok:true,text:async()=>'<ul id="browserItemList"><li id="item_2"><p class="info tip">2022-01-01</p></li></ul>'}));
  dom.window.fetch=fetcher;
  dom.window.eval(readFileSync('dist/gadget.js','utf8'));
  expect(dom.window.document.querySelector('.bgmcy-row').textContent).toContain('2016');
  expect(fetcher).not.toHaveBeenCalled();
  const selector=dom.window.document.querySelector('[aria-label="收藏状态"]');
  selector.value='collect';selector.dispatchEvent(new dom.window.Event('change'));
  await vi.waitFor(()=>expect(dom.window.document.querySelector('.bgmcy-row')?.textContent).toContain('2022'));
  expect(fetcher.mock.calls.map(c=>new URL(c[0]).pathname)).toEqual(['/game/list/kazv/collect']);
});
it('过期缓存先展示结果，再自动更新；刷新失败保留缓存', async () => {
  dom=new JSDOM('<div id="columnSubjectBrowserA"></div><div id="columnSubjectBrowserB"></div>',{url:'https://bgm.tv/game/list/kazv/do',runScripts:'outside-only'});
  dom.window.localStorage.setItem('bgmcy:v2:guest:kazv:game:do',JSON.stringify({at:1,items:[{subjectId:'1',media:'game',status:'do',year:2016}]}));
  dom.window.fetch=vi.fn(async()=>({ok:false,status:403}));
  dom.window.eval(readFileSync('dist/gadget.js','utf8'));
  expect(dom.window.document.querySelector('.bgmcy-row').textContent).toContain('2016');
  await vi.waitFor(()=>expect(dom.window.document.querySelector('.bgmcy-status').textContent).toContain('更新失败'));
  expect(dom.window.document.querySelector('.bgmcy-row').textContent).toContain('2016');
});
it('收藏概览页在通用侧栏自动显示当前类别的全部状态', async()=>{
  dom=new JSDOM('<div id="columnA"></div><div id="columnB"></div>',{url:'https://bgm.tv/game/list/kazv',runScripts:'outside-only'});
  dom.window.fetch=vi.fn(async()=>({ok:true,text:async()=>'<ul id="browserItemList"></ul>'}));
  dom.window.eval(readFileSync('dist/gadget.js','utf8'));
  await vi.waitFor(()=>expect(dom.window.document.querySelector('.bgmcy-summary')?.textContent).toContain('0'));
  expect(dom.window.document.querySelector('#columnB #bgm-collection-years')).not.toBeNull();
  expect(dom.window.fetch).toHaveBeenCalledTimes(5);
  expect(dom.window.document.querySelector('[aria-label="收藏状态"]').value).toBe('all');
});
it('收藏列表删除作品后自动刷新相关缓存', async()=>{
  dom=new JSDOM('<div id="columnSubjectBrowserA"><ul id="browserItemList"><li id="item_1"><p class="info tip">2016-01-01</p></li></ul></div><div id="columnSubjectBrowserB"></div>',{url:'https://bgm.tv/game/list/kazv/do',runScripts:'outside-only'});
  dom.window.localStorage.setItem('bgmcy:v2:guest:kazv:game:do',JSON.stringify({at:Date.now(),items:[{subjectId:'1',media:'game',status:'do',year:2016,private:false}]}));
  dom.window.fetch=vi.fn(async()=>({ok:true,text:async()=>'<ul id="browserItemList"></ul>'}));
  dom.window.eval(readFileSync('dist/gadget.js','utf8'));
  expect(dom.window.fetch).not.toHaveBeenCalled();
  dom.window.document.querySelector('#item_1').remove();
  await vi.waitFor(()=>expect(dom.window.document.querySelector('.bgmcy-summary')?.textContent).toContain('0'),{timeout:2000});
  expect(dom.window.fetch).toHaveBeenCalledTimes(1);
});
