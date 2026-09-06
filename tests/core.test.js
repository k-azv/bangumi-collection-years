import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import {
  aggregateCollections,
  extractReleaseYear,
  fetchCollectionPages,
  getNextPageUrl,
  parseCollectionDocument,
  parseRoute,
} from '../src/core.js';

function doc(html) {
  return new JSDOM(html).window.document;
}

describe('parseRoute', () => {
  it('识别用户主页与五类收藏页', () => {
    expect(parseRoute('/user/kazv')).toEqual({ kind: 'profile', media: null, username: 'kazv', status: null });
    expect(parseRoute('/game/list/kazv/collect')).toEqual({ kind: 'list', media: 'game', username: 'kazv', status: 'collect' });
    expect(parseRoute('/book/list/kazv')).toEqual({ kind: 'list', media: 'book', username: 'kazv', status: null });
    expect(parseRoute('/user/kazv/timeline')).toBeNull();
  });
});

describe('收藏页解析', () => {
  it('从作品资料读取发行年份，同时识别私有收藏', () => {
    const page = doc(`<ul id="browserItemList">
      <li id="item_340"><p class="info tip">26话 / 2005年10月22日 / 長濵博史</p><p class="collectInfo"><span class="tip_j">2025-11-4</span> / 自己可见</p></li>
      <li id="item_341"><p class="info tip">1话 / 遠田おと / 20</p><p class="collectInfo"><span class="tip_j">2024-1-2</span></p></li>
    </ul>`);
    expect(parseCollectionDocument(page, 'anime', 'wish')).toEqual([
      { subjectId: '340', title: '#340', media: 'anime', status: 'wish', year: 2005, private: true },
      { subjectId: '341', title: '#341', media: 'anime', status: 'wish', year: null, private: false },
    ]);
  });

  it('兼容五类页面常见的中日文日期格式', () => {
    const samples = [
      ['anime', '12话 /  2024年4月4日 / 登坂晋', 2024],
      ['book', '4话 /  2021-10-04 / 藤本タツキ', 2021],
      ['game', '2015年7月30日（Android 日本） / Android、iOS / 运营至2022年', 2015],
      ['music', '2010-08-14 / C78', 2010],
      ['real', '8话 /  2019-07-26 / Dan Trachtenberg', 2019],
    ];
    for (const [media, info, year] of samples) {
      const page = doc(`<ul id="browserItemList"><li id="item_1"><p class="info tip">${info}</p><p class="collectInfo">2026-1-1</p></li></ul>`);
      expect(parseCollectionDocument(page, media, 'collect')[0].year).toBe(year);
    }
  });

  it('只读取作品资料开头或话数之后的发行年份', () => {
    expect(extractReleaseYear('1话 / 遠田おと / Project 2020')).toBeNull();
    expect(extractReleaseYear('2015年7月30日（Android 日本） / 运营至2022年')).toBe(2015);
    expect(extractReleaseYear('12话 / 2024年4月4日 / 登坂晋')).toBe(2024);
  });

  it('沿分页当前页后的链接前进', () => {
    const page = doc('<div class="page_inner"><a class="p">1</a><strong class="p_cur">2</strong><a class="p" href="?page=3">3</a><a class="p" href="?page=3">››</a></div>');
    expect(getNextPageUrl(page, 'https://bgm.tv/anime/list/kazv/wish?page=2')).toBe('https://bgm.tv/anime/list/kazv/wish?page=3');
  });
});

describe('aggregateCollections', () => {
  it('按年份与状态聚合并去重', () => {
    const result = aggregateCollections([
      { media: 'anime', subjectId: '1', status: 'collect', year: 2025, private: true },
      { media: 'anime', subjectId: '1', status: 'collect', year: 2025, private: true },
      { media: 'anime', subjectId: '2', status: 'wish', year: 2024, private: false },
      { media: 'anime', subjectId: '3', status: 'do', year: null, private: false },
    ]);
    expect(result.total).toBe(3);
    expect(result.unknown).toBe(1);
    expect(result.privateCount).toBe(1);
    expect(result.years[0]).toMatchObject({ year: 2025, statuses: { collect: 1 } });
  });
});

describe('fetchCollectionPages', () => {
  it('使用同源凭据读取全部分页', async () => {
    vi.stubGlobal('location', new URL('https://bgm.tv/user/kazv'));
    vi.stubGlobal('DOMParser', new JSDOM('').window.DOMParser);
    const pages = [
      '<ul id="browserItemList"><li id="item_1"><p class="info tip">2020年3月11日 / PC</p><p class="collectInfo"><span class="tip_j">2025-1-1</span> / 自己可见</p></li></ul><div class="page_inner"><strong class="p_cur">1</strong><a class="p" href="?page=2">2</a></div>',
      '<ul id="browserItemList"><li id="item_2"><p class="info tip">2009-09-18 / PC</p><p class="collectInfo"><span class="tip_j">2024-1-1</span></p></li></ul><div class="page_inner"><a class="p" href="?page=1">1</a><strong class="p_cur">2</strong></div>',
    ];
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => pages.shift() }));
    const result = await fetchCollectionPages({ media: 'anime', username: 'kazv', status: 'wish', fetchImpl });
    expect(result).toHaveLength(2);
    expect(result[0].private).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].credentials).toBe('same-origin');
    vi.unstubAllGlobals();
  });

  it('服务端临时失败时重试', async () => {
    vi.stubGlobal('location', new URL('https://bgm.tv/user/kazv'));
    vi.stubGlobal('DOMParser', new JSDOM('').window.DOMParser);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '<ul id="browserItemList"></ul>' });
    await expect(fetchCollectionPages({ media: 'music', username: 'kazv', status: 'collect', fetchImpl })).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});

describe('详情页补全年份', () => {
  it('从随心一听的连载开始识别2022年，区分上映待定', async () => {
    const {parseSubjectDate}=await import('../src/core.js');
    expect(parseSubjectDate(doc('<ul id="infobox"><li>连载开始: 2022-07-04</li><li>连载结束: 2023-01-01</li></ul>'),'book')).toEqual({year:2022,dateState:'dated'});
    expect(parseSubjectDate(doc('<ul id="infobox"><li>上映年度: *</li></ul>'),'anime')).toEqual({year:null,dateState:'pending'});
    expect(parseSubjectDate(doc('<ul id="infobox"><li>原作: Project 2020</li></ul>'),'anime')).toEqual({year:null,dateState:'unknown'});
  });
  it('仅对列表日期缺失的作品同源读取详情', async () => {
    const {completeSubjectDates}=await import('../src/core.js');
    vi.stubGlobal('location',new URL('https://bgm.tv/user/kazv'));
    vi.stubGlobal('DOMParser',new JSDOM('').window.DOMParser);
    const fetchImpl=vi.fn(async()=>({ok:true,text:async()=>'<ul id="infobox"><li>连载开始: 2022-07-04</li></ul>'}));
    const result=await completeSubjectDates([{subjectId:'388782',media:'book',year:null},{subjectId:'2',media:'book',year:2000}],{fetchImpl});
    expect(result.map(item=>item.year)).toEqual([2022,2000]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://bgm.tv/subject/388782');
    vi.unstubAllGlobals();
  });
});
it('分布按筛选后的总数计算占比，保留待定项', async()=>{
  const {distribution,tasksForSelection}=await import('../src/core.js');
  expect(tasksForSelection('game','do')).toEqual([{media:'game',status:'do'}]);
  const data=distribution([{subjectId:'1',media:'anime',year:2020},{subjectId:'2',media:'anime',year:2020},{subjectId:'3',media:'anime',year:null}]);
  expect(data.total).toBe(3);
  expect(data.rows[0].percent).toBeCloseTo(200/3);
  expect(data.unknown).toHaveLength(1);
});
it('统计请求必须属于具体的站点类别', async()=>{
  const {tasksForSelection}=await import('../src/core.js');
  expect(()=>tasksForSelection('all','collect')).toThrow('请选择作品类别');
  expect(tasksForSelection('book','collect')).toEqual([{media:'book',status:'collect'}]);
});
it('多个状态分页并发共享请求上限，完成结果保持页序',async()=>{
 const {createRequestQueue}=await import('../src/core.js');
 vi.stubGlobal('location',new URL('https://bgm.tv'));vi.stubGlobal('DOMParser',new JSDOM('').window.DOMParser);
 let active=0,peak=0;
 const fetcher=async url=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;const page=Number(new URL(url).searchParams.get('page')||1);return {ok:true,text:async()=>`<ul id="browserItemList"><li id="item_${page}"><p class="info tip">2020-01-01</p></li></ul><div class="page_inner"><a href="?page=6">6</a></div>`};};
 const fetchImpl=createRequestQueue(new AbortController().signal,4,fetcher);
 const results=await Promise.all(['wish','collect'].map(status=>fetchCollectionPages({media:'anime',username:'test',status,fetchImpl})));
 expect(peak).toBe(4);expect(results.map(items=>items.map(x=>x.subjectId))).toEqual([['1','2','3','4','5','6'],['1','2','3','4','5','6']]);vi.unstubAllGlobals();
});
