import { afterEach, expect, it, vi } from 'vitest';
import { createNetwork } from '../src/network.js';
function shared() {
 const data=new Map(), tails=new Map();
 return {storage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},locks:{request(name,options,fn){const task=(tails.get(name)||Promise.resolve()).catch(()=>{}).then(()=>{if(options.signal?.aborted)throw options.signal.reason;return fn();});tails.set(name,task);return task;}}};
}
afterEach(()=>vi.useRealTimers());
it('多个标签页的请求共用四个槽位且每次发起间隔至少250毫秒',async()=>{
 vi.useFakeTimers();const common=shared();let active=0,peak=0;const starts=[];
 const fetchImpl=async()=>{starts.push(Date.now());active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1200));return {ok:true,status:200,text:async()=>{active--;return ''}};};
 const clients=Array.from({length:5},()=>createNetwork({...common,fetchImpl}));
 const done=Promise.all(clients.flatMap(c=>Array.from({length:4},()=>c.request('https://bgm.tv/'))));
 await vi.runAllTimersAsync();await done;
 expect(peak).toBeLessThanOrEqual(4);expect(starts).toHaveLength(20);
 expect(starts.slice(1).every((time,i)=>time-starts[i]>=250)).toBe(true);
});
it('Retry-After在所有标签页生效，强制调用也不能绕过冷却',async()=>{
 vi.useFakeTimers();const common=shared();const fetchImpl=vi.fn(async()=>({ok:false,status:429,headers:new Headers({'Retry-After':'120'}),text:async()=>''}));
 const a=createNetwork({...common,fetchImpl,random:()=>0}),b=createNetwork({...common,fetchImpl});
 const first=expect(a.request('https://bgm.tv/')).rejects.toMatchObject({retryAt:expect.any(Number)});await vi.runAllTimersAsync();await first;
 await expect(b.request('https://bgm.tv/')).rejects.toThrow('429');
 expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it('网络超时冷却，等待槽位的请求取消后不会访问主站',async()=>{
 vi.useFakeTimers();const common=shared();const fetchImpl=vi.fn((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason))));
 const client=createNetwork({...common,fetchImpl,random:()=>0});
 const result=expect(client.request('https://bgm.tv/')).rejects.toThrow('请求超时');await vi.advanceTimersByTimeAsync(16000);await result;
 const controller=new AbortController();controller.abort(new Error('cancelled'));
 await expect(client.request('https://bgm.tv/',{signal:controller.signal})).rejects.toThrow('cancelled');
 expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it('缺少Web Locks时当前页面仍限制请求发起频率',async()=>{
 vi.useFakeTimers();const starts=[];const client=createNetwork({fetchImpl:async()=>{starts.push(Date.now());return {ok:true,status:200,text:async()=>''}}});
 const done=Promise.all(Array.from({length:8},()=>client.request('https://bgm.tv/')));await vi.runAllTimersAsync();await done;
 expect(starts.slice(1).every((time,i)=>time-starts[i]>=250)).toBe(true);
});
it('存储写入失败时仍执行新的冷却期限',async()=>{
 vi.useFakeTimers();const storage={getItem:()=>JSON.stringify({until:1,failures:0}),setItem:()=>{throw Error('quota')}};
 const fetchImpl=vi.fn(async()=>({status:429,headers:new Headers(),text:async()=>''}));
 const client=createNetwork({storage,fetchImpl,random:()=>0});
 const result=expect(client.request('/')).rejects.toThrow('429');await vi.runAllTimersAsync();await result;
 await expect(client.request('/')).rejects.toThrow('429');expect(fetchImpl).toHaveBeenCalledTimes(1);
});
