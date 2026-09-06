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
  dom.window.localStorage.setItem('bgmcy:chart-mode','list');
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
  dom.window.localStorage.setItem('bgmcy:chart-mode','list');
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
  dom.window.localStorage.setItem('bgmcy:chart-mode','list');
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
it('个人页先限定具体类别，并在类别切换后提供原生状态', async()=>{
  dom=new JSDOM('<div id="user_home"></div><div id="columnB"></div>',{url:'https://bgm.tv/user/kazv',runScripts:'outside-only'});
  dom.window.fetch=vi.fn(async()=>({ok:true,text:async()=>'<ul id="browserItemList"></ul>'}));
  dom.window.eval(readFileSync('dist/gadget.js','utf8'));
  await vi.waitFor(()=>expect(dom.window.document.querySelector('.bgmcy-summary')?.textContent).toContain('0'));
  const category=dom.window.document.querySelector('[aria-label="收藏类别"]');
  const state=dom.window.document.querySelector('[aria-label="收藏状态"]');
  expect([...category.options].map(o=>o.value)).toEqual(['book','anime','music','game','real']);
  expect(category.value).toBe('anime');
  expect([...state.options].map(o=>o.textContent)).toEqual(['概览','想看','看过','在看','搁置','抛弃']);
  expect(dom.window.fetch.mock.calls.every(([url])=>new URL(url).pathname.startsWith('/anime/list/'))).toBe(true);
  [...dom.window.document.querySelectorAll('.bgmcy-states button')].find(b=>b.textContent==='在看').click();
  expect(state.value).toBe('do');
  [...dom.window.document.querySelectorAll('.bgmcy-categories button')].find(b=>b.textContent==='游戏').click();
  await vi.waitFor(()=>expect(dom.window.document.querySelector('.bgmcy-summary')?.textContent).toContain('0'));
  expect(state.value).toBe('all');
  expect([...state.options].map(o=>o.textContent)).toEqual(['概览','想玩','玩过','在玩','搁置','抛弃']);
});
it('三种图表共用数据，年代展开与返回正确，切换保存偏好且不重新请求',async()=>{
 dom=new JSDOM('<div id="columnSubjectBrowserA"></div><div id="columnSubjectBrowserB"></div>',{url:'https://bgm.tv/anime/list/kazv/collect',runScripts:'outside-only'});
 const items=[{subjectId:'1',media:'anime',status:'collect',year:1982},{subjectId:'2',media:'anime',status:'collect',year:2000},{subjectId:'3',media:'anime',status:'collect',year:2009},{subjectId:'4',media:'anime',status:'collect',year:2009},{subjectId:'5',media:'anime',status:'collect',year:2026}];
 dom.window.localStorage.setItem('bgmcy:v2:guest:kazv:anime:collect',JSON.stringify({at:Date.now(),items}));
 dom.window.fetch=vi.fn();
 dom.window.eval(readFileSync('dist/gadget.js','utf8'));
 const doc=dom.window.document,mode=doc.querySelector('[aria-label="图表类型"]');
 const sum=()=>[...doc.querySelectorAll('.bgmcy-column')].reduce((n,e)=>n+Number(e.dataset.count),0);
 expect(mode.value).toBe('decade');expect(sum()).toBe(5);
 expect(doc.querySelector('.bgmcy-chart-detail').hidden).toBe(false);
 expect(doc.querySelector('.bgmcy-chart-detail output').textContent).toBeTruthy();
 doc.querySelector('.bgmcy-plot-targets button[data-year="2000"]').click();
 expect(doc.querySelectorAll('.bgmcy-column')).toHaveLength(5);
 doc.querySelector('.bgmcy-open-decade').click();
 expect(doc.querySelector('.bgmcy-chart-detail output').textContent).toBeTruthy();
 expect(doc.querySelectorAll('.bgmcy-column')).toHaveLength(10);expect(sum()).toBe(3);
 expect(doc.querySelector('.bgmcy-chart-detail output').textContent).toBe('2009 年 · 2 部 · 40.0%');
 doc.querySelector('.bgmcy-chart-nav button').click();expect(sum()).toBe(5);
 mode.value='year';mode.dispatchEvent(new dom.window.Event('change'));
 expect(doc.querySelectorAll('.bgmcy-column')).toHaveLength(45);expect(sum()).toBe(5);
 doc.querySelector('.bgmcy-plot-targets button[data-year="2001"]').click();
 expect(doc.querySelector('output').textContent).toBe('2001 年 · 0 部 · 0.0%');
 const hover=new dom.window.Event('pointerenter');Object.defineProperty(hover,'pointerType',{value:'mouse'});
 doc.querySelector('.bgmcy-plot-targets button[data-year="2009"]').dispatchEvent(hover);
 expect(doc.querySelector('output').textContent).toBe('2009 年 · 2 部 · 40.0%');
 doc.querySelector('.bgmcy-plot-targets').dispatchEvent(new dom.window.Event('pointerleave'));
 expect(doc.querySelector('output').textContent).toBe('2001 年 · 0 部 · 0.0%');
 doc.querySelector('.bgmcy-histogram').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 expect(doc.querySelector('output').textContent).toBe('2002 年 · 0 部 · 0.0%');
 mode.value='list';mode.dispatchEvent(new dom.window.Event('change'));
 expect([...doc.querySelectorAll('.bgmcy-count')].reduce((n,e)=>n+Number(e.textContent),0)).toBe(5);
 expect(dom.window.localStorage.getItem('bgmcy:chart-mode')).toBe('list');
 expect(dom.window.fetch).not.toHaveBeenCalled();
});
it('加载期间切回标签页复用请求，缓存命中保留图表选择', async()=>{
 dom=new JSDOM('<div id="columnSubjectBrowserA"></div><div id="columnSubjectBrowserB"></div>',{url:'https://bgm.tv/anime/list/kazv/collect',runScripts:'outside-only',pretendToBeVisual:true});
 let finish;
 dom.window.fetch=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
 dom.window.eval(readFileSync('dist/gadget.js','utf8'));
 for(let i=0;i<3;i++)dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
 expect(dom.window.fetch).toHaveBeenCalledTimes(1);
 finish({ok:true,text:async()=>'<ul id="browserItemList"><li id="item_1"><p class="info tip">2022-01-01</p></li></ul>'});
 await vi.waitFor(()=>expect(dom.window.document.querySelector('.bgmcy-histogram')).not.toBeNull());
 const chart=dom.window.document.querySelector('.bgmcy-histogram');
 dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
 expect(dom.window.document.querySelector('.bgmcy-histogram')).toBe(chart);
 expect(dom.window.fetch).toHaveBeenCalledTimes(1);
});
it('收藏变化刷新受影响状态并复用概览中的其他缓存',async()=>{
 dom=new JSDOM('<a href="/anime/list/kazv/collect">看过 (1)</a><a href="/anime/list/kazv/do">在看 (0)</a><div id="columnSubjectBrowserA"><ul id="browserItemList"><li id="item_1"><p class="info tip">2022-01-01</p></li></ul></div><div id="columnSubjectBrowserB"></div>',{url:'https://bgm.tv/anime/list/kazv/collect',runScripts:'outside-only'});
 for(const status of ['wish','collect','do','on_hold','dropped'])dom.window.localStorage.setItem(`bgmcy:v2:guest:kazv:anime:${status}`,JSON.stringify({at:Date.now(),items:status==='collect'?[{subjectId:'1',media:'anime',status,year:2022,private:false}]:[]}));
 dom.window.fetch=vi.fn(async()=>({ok:true,text:async()=>'<ul id="browserItemList"></ul>'}));
 dom.window.eval(readFileSync('dist/gadget.js','utf8'));
 const selector=dom.window.document.querySelector('[aria-label="收藏状态"]');selector.value='all';selector.dispatchEvent(new dom.window.Event('change'));
 expect(dom.window.fetch).not.toHaveBeenCalled();
 dom.window.document.querySelector('a').textContent='看过 (0)';dom.window.document.querySelector('#item_1').remove();
 await vi.waitFor(()=>expect(dom.window.document.querySelector('.bgmcy-summary').textContent).toContain('0'),{timeout:2000});
 expect(dom.window.fetch.mock.calls.map(([url])=>new URL(url).pathname)).toEqual(['/anime/list/kazv/collect']);
});
it('加载中切换到缓存状态再返回可正常重启原状态请求',async()=>{
 dom=new JSDOM('<div id="columnSubjectBrowserA"></div><div id="columnSubjectBrowserB"></div>',{url:'https://bgm.tv/anime/list/kazv/collect',runScripts:'outside-only'});
 dom.window.localStorage.setItem('bgmcy:v2:guest:kazv:anime:do',JSON.stringify({at:Date.now(),items:[]}));
 dom.window.fetch=vi.fn((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))));
 dom.window.eval(readFileSync('dist/gadget.js','utf8'));
 const select=dom.window.document.querySelector('[aria-label="收藏状态"]');
 select.value='do';select.dispatchEvent(new dom.window.Event('change'));
 select.value='collect';select.dispatchEvent(new dom.window.Event('change'));
 expect(dom.window.fetch).toHaveBeenCalledTimes(2);
});
it('刷新返回相同内容保留图表，外部缓存更新显示新数据',async()=>{
 dom=new JSDOM('<div id="columnSubjectBrowserA"></div><div id="columnSubjectBrowserB"></div>',{url:'https://bgm.tv/anime/list/kazv/collect',runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.fetch=vi.fn(async()=>({ok:true,text:async()=>'<ul id="browserItemList"><li id="item_1"><p class="info tip">2022-01-01</p></li></ul>'}));
 dom.window.eval(readFileSync('dist/gadget.js','utf8'));
 await vi.waitFor(()=>expect(dom.window.document.querySelector('.bgmcy-summary')).not.toBeNull());
 const chart=dom.window.document.querySelector('.bgmcy-histogram');
 dom.window.document.querySelector('.bgmcy-refresh').click();
 await vi.waitFor(()=>expect(dom.window.document.querySelector('.bgmcy-refresh').disabled).toBe(false));
 expect(dom.window.fetch).toHaveBeenCalledTimes(2);
 expect(dom.window.document.querySelector('.bgmcy-histogram')).toBe(chart);
 dom.window.localStorage.setItem('bgmcy:v2:guest:kazv:anime:collect',JSON.stringify({at:Date.now(),items:[]}));
 dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
 expect(dom.window.document.querySelector('.bgmcy-summary').textContent).toContain('0');
});
