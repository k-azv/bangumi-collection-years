import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
const pages=[];
afterEach(()=>{pages.splice(0).forEach(p=>p.window.close());});
function page(){const dom=new JSDOM('<div id="columnSubjectBrowserA"></div><div id="columnSubjectBrowserB"></div>',{url:'https://bgm.tv/anime/list/test/collect',runScripts:'outside-only',pretendToBeVisual:true});pages.push(dom);return dom.window;}
const bundle=()=>readFileSync('dist/gadget.js','utf8');
it('主站限流后反复回到页面不会重新发起请求',async()=>{
 const w=page();w.fetch=vi.fn(async()=>({ok:false,status:429,headers:new Headers({'Retry-After':'120'}),text:async()=>''}));w.eval(bundle());
 await vi.waitFor(()=>expect(w.document.querySelector('.bgmcy-status').textContent).toContain('429'));
 for(let i=0;i<5;i++){w.document.dispatchEvent(new w.Event('visibilitychange'));await new Promise(r=>setTimeout(r,5));}
 expect(w.fetch).toHaveBeenCalledTimes(1);
});
it('尺寸通知但宽度不变时保留图表节点及键盘焦点',async()=>{
 const w=page(),callbacks=[];w.ResizeObserver=class{constructor(cb){callbacks.push(cb)}observe(){}disconnect(){}};
 w.localStorage.setItem('bgmcy:v2:guest:test:anime:collect',JSON.stringify({at:Date.now(),items:[{subjectId:'1',media:'anime',status:'collect',year:2020}]}));
 w.fetch=vi.fn();w.eval(bundle());const button=w.document.querySelector('.bgmcy-plot-targets button');button.focus();
 callbacks.forEach(cb=>cb());
 expect(w.document.querySelector('.bgmcy-plot-targets button')===button).toBe(true);
 expect(w.document.activeElement===button).toBe(true);
});
it('同一用户同一状态在两个标签页同时打开只抓取一次',async()=>{
 const a=page(),b=page();Object.defineProperty(b,'localStorage',{value:a.localStorage});
 // FIFO lock manager shared by both simulated tabs, matching Web Locks exclusivity.
 const tails=new Map();const locks={request(name,options,callback){const previous=tails.get(name)||Promise.resolve();const next=previous.catch(()=>{}).then(()=>{if(options.signal?.aborted)throw options.signal.reason;return callback({name});});tails.set(name,next);return next;}};
 for(const w of [a,b])Object.defineProperty(w.navigator,'locks',{value:locks});
 const fetcher=vi.fn(async()=>{await new Promise(r=>setTimeout(r,20));return {ok:true,status:200,text:async()=>'<ul id="browserItemList"><li id="item_1"><p class="info tip">2020-01-01</p></li></ul>'};});
 a.fetch=b.fetch=fetcher;a.eval(bundle());b.eval(bundle());
 await vi.waitFor(()=>{expect(a.document.querySelector('.bgmcy-summary')).not.toBeNull();expect(b.document.querySelector('.bgmcy-summary')).not.toBeNull();});
 expect(fetcher).toHaveBeenCalledTimes(1);
});
