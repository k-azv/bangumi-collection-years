import { expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { histogramRows, readChartMode, saveChartMode } from '../src/charts.js';
it('按十年求和，逐年视图补齐空年份，展开限定为所选年代',()=>{
 const rows=[{year:1982,count:1},{year:2000,count:2},{year:2009,count:3},{year:2011,count:4}];
 expect(histogramRows(rows,'decade')).toEqual([{year:1980,count:1},{year:1990,count:0},{year:2000,count:5},{year:2010,count:4}]);
 const annual=histogramRows(rows,'year');
 expect(annual).toHaveLength(30);
 expect(annual.reduce((n,r)=>n+r.count,0)).toBe(10);
 const decade=histogramRows(rows,'decade',2000);
 expect(decade).toHaveLength(10);
 expect(decade.reduce((n,r)=>n+r.count,0)).toBe(5);
 expect(histogramRows([], 'decade')).toEqual([]);
});
it('初始使用年代柱状图，合法偏好可持久化，异常存储使用默认值',()=>{
 const dom=new JSDOM('',{url:'https://bgm.tv'}),storage=dom.window.localStorage;
 expect(readChartMode(storage)).toBe('decade');
 saveChartMode(storage,'year');expect(readChartMode(storage)).toBe('year');
 saveChartMode(storage,'bad');expect(readChartMode(storage)).toBe('year');
 storage.setItem('bgmcy:chart-mode','bad');expect(readChartMode(storage)).toBe('decade');
 expect(readChartMode(undefined)).toBe('decade');
 expect(()=>saveChartMode(undefined,'list')).not.toThrow();
 dom.window.close();
});
