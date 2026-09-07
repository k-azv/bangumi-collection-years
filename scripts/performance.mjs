import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

// Compare bundles in the same process. JSDOM measures scripting, not browser painting.
const bundles = process.argv.slice(2);
if (!bundles.length) bundles.push('dist/gadget.js');
for (const n of [1000, 10000, 50000]) {
  const items = Array.from({length:n},(_,i)=>({subjectId:String(i+1),media:'anime',status:'collect',year:1974+i%53,title:'测试作品',private:false}));
  for (const file of bundles) {
    const page = items.slice(-24).map(item => `<li id="item_${item.subjectId}"><p class="info tip">${item.year}-01-01</p></li>`).join('');
    const dom = new JSDOM(`<a href="/anime/list/kazv/collect">看过 (${n})</a><div id="columnSubjectBrowserA"><ul id="browserItemList">${page}</ul></div><div id="columnSubjectBrowserB"></div>`, {url:'https://bgm.tv/anime/list/kazv/collect',runScripts:'outside-only',pretendToBeVisual:true});
    dom.window.localStorage.setItem('bgmcy:v2:guest:kazv:anime:collect',JSON.stringify({at:Date.now(),items}));
    dom.window.fetch = () => { throw new Error('Unexpected network request in warm-cache benchmark'); };
    dom.window.eval(readFileSync(file,'utf8'));
    const chart=dom.window.document.querySelector('.bgmcy-histogram');
    if (!chart) throw new Error('Chart did not render');
    const times=[];
    for(let i=0;i<30;i++) {
      const start=performance.now();
      dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
      times.push(performance.now()-start);
    }
    times.sort((a,b)=>a-b);
    console.log(JSON.stringify({bundle:file,items:n,medianMs:+times[15].toFixed(3),p95Ms:+times[28].toFixed(3),chartRetained:chart===dom.window.document.querySelector('.bgmcy-histogram')}));
    dom.window.close();
  }
}
