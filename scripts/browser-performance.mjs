import http from 'node:http';
import { readFile } from 'node:fs/promises';
// Local-only renderer benchmark. Use BASELINE to compare an earlier built bundle.
const port=Number(process.env.PORT||4175);
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/gadget.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(u.searchParams.get('variant')==='baseline'&&process.env.BASELINE?process.env.BASELINE:'dist/gadget.js'));return;}
 if(u.pathname==='/style.css'){res.setHeader('Content-Type','text/css');res.end(await readFile('dist/gadget.css'));return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');
 const n=Math.min(50000,Math.max(1,Number(u.searchParams.get('size'))||10000));
 res.end(`<!doctype html><meta charset="utf-8"><title>组件渲染测量</title><link rel="stylesheet" href="/style.css"><style>body{font:12px Arial}#columnSubjectBrowserB{width:300px}#result{white-space:pre-wrap}</style><button id="measure">运行渲染测量</button><pre id="result"></pre><div id="columnSubjectBrowserA"></div><div id="columnSubjectBrowserB"></div><script>
 const items=Array.from({length:${n}},(_,i)=>({subjectId:String(i+1),media:'anime',status:'collect',year:1800+i%227,private:false}));
 localStorage.setItem('bgmcy:v2:guest:test:anime:collect',JSON.stringify({at:Date.now(),items}));localStorage.setItem('bgmcy:chart-mode','decade');
 window.fetch=()=>{throw Error('Unexpected network request')};
 const start=performance.now();
 </script><script src="/gadget.js?variant=${u.searchParams.get('variant')==='baseline'?'baseline':'current'}"></script><script>
 const initMs=performance.now()-start;
 document.getElementById('measure').onclick=async()=>{
 if(document.visibilityState!=='visible'){document.getElementById('result').textContent='请将测试页置于前台后运行';return;}
 const mode=document.querySelector('[aria-label="图表类型"]');if(!mode)throw Error('Missing chart');
 const times=[],frames=[];const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 for(let i=0;i<30;i++){const t=performance.now();mode.value=['year','list','decade'][i%3];mode.dispatchEvent(new Event('change'));times.push(performance.now()-t);await frame();frames.push(performance.now()-t);}
 times.sort((a,b)=>a-b);frames.sort((a,b)=>a-b);
 document.getElementById('result').textContent=JSON.stringify({items:${n},initMs,handlerMedianMs:times[15],handlerP95Ms:times[28],twoFrameP95Ms:frames[28],nodes:document.querySelectorAll('#bgm-collection-years *').length});
 };
 </script>`);
}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+'/anime/list/test/collect?size=50000&variant=baseline'));
