export const MEDIA = Object.freeze({
  anime: { label: '动画', order: 0 },
  book: { label: '书籍', order: 1 },
  music: { label: '音乐', order: 2 },
  game: { label: '游戏', order: 3 },
  real: { label: '三次元', order: 4 },
});

export const STATUS_ORDER = Object.freeze(['wish', 'collect', 'do', 'on_hold', 'dropped']);

export const STATUS_LABELS = Object.freeze({
  anime: { wish: '想看', collect: '看过', do: '在看', on_hold: '搁置', dropped: '抛弃' },
  book: { wish: '想读', collect: '读过', do: '在读', on_hold: '搁置', dropped: '抛弃' },
  music: { wish: '想听', collect: '听过', do: '在听', on_hold: '搁置', dropped: '抛弃' },
  game: { wish: '想玩', collect: '玩过', do: '在玩', on_hold: '搁置', dropped: '抛弃' },
  real: { wish: '想看', collect: '看过', do: '在看', on_hold: '搁置', dropped: '抛弃' },
});

const ROUTE_RE = /^\/(anime|book|music|game|real)\/list\/([^/?#]+)(?:\/(wish|collect|do|on_hold|dropped))?\/?$/;
const PROFILE_RE = /^\/user\/([^/?#]+)\/?$/;
const RELEASE_YEAR_RE = /^(?:\d+\s*话\s*\/\s*)?((?:18|19|20|21)\d{2})(?=[-年]|\b)/;

export function extractReleaseYear(subjectInfo) {
  const match = subjectInfo.match(RELEASE_YEAR_RE);
  return match ? Number(match[1]) : null;
}

export function parseRoute(pathname) {
  const list = pathname.match(ROUTE_RE);
  if (list) {
    return { kind: 'list', media: list[1], username: decodeURIComponent(list[2]), status: list[3] || null };
  }
  const profile = pathname.match(PROFILE_RE);
  if (profile) {
    return { kind: 'profile', media: null, username: decodeURIComponent(profile[1]), status: null };
  }
  return null;
}

export function getSignedInUsername(doc = document) {
  const href = doc.querySelector('#dock li.first a[href*="/user/"]')?.getAttribute('href');
  if (!href) return null;
  try {
    const path = new URL(href, location.origin).pathname;
    return decodeURIComponent(path.match(/^\/user\/([^/]+)/)?.[1] || '') || null;
  } catch {
    return null;
  }
}

export function parseCollectionDocument(doc, media, status) {
  const items = [];
  for (const element of doc.querySelectorAll('#browserItemList > li')) {
    const subjectId = element.id.match(/^item_(\d+)$/)?.[1];
    if (!subjectId) continue;
    const subjectInfo = element.querySelector('p.info.tip')?.textContent?.trim() || '';
    const collectionInfo = element.querySelector('.collectInfo')?.textContent?.trim() || '';
    items.push({
      subjectId,
      title: element.querySelector("h3 a")?.textContent?.trim() || `#${subjectId}`,
      media,
      status,
      year: extractReleaseYear(subjectInfo),
      private: /自己可见/.test(collectionInfo),
    });
  }
  return items;
}

export function getNextPageUrl(doc, currentUrl) {
  const current = doc.querySelector('.page_inner .p_cur');
  const next = current?.nextElementSibling;
  if (!next?.matches('a.p[href]')) return null;
  return new URL(next.getAttribute('href'), currentUrl).href;
}

export function aggregateCollections(items) {
  const years = new Map();
  const seen = new Set();
  let unknown = 0;
  let privateCount = 0;

  for (const item of items) {
    const key = `${item.media}:${item.subjectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (item.private) privateCount += 1;
    if (!item.year) {
      unknown += 1;
      continue;
    }
    if (!years.has(item.year)) years.set(item.year, Object.fromEntries(STATUS_ORDER.map(status => [status, 0])));
    years.get(item.year)[item.status] += 1;
  }

  return {
    total: seen.size,
    dated: seen.size - unknown,
    unknown,
    privateCount,
    years: [...years.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, statuses]) => ({ year, statuses })),
  };
}

export async function fetchCollectionPages({ media, username, status, fetchImpl = fetch, onPage, signal }) {
  let url = new URL(`/${media}/list/${encodeURIComponent(username)}/${status}`, location.origin).href;
  const items = [];
  const visited = new Set();

  while (url && !visited.has(url)) {
    visited.add(url);
    let response;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetchImpl(url, {
          credentials: 'same-origin',
          headers: { Accept: 'text/html' },
          signal,
        });
        if (response.ok || response.status < 500 || attempt === 2) break;
      } catch (error) {
        if (signal?.aborted || attempt === 2) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)));
    }
    if (!response.ok) throw new Error(`读取收藏失败（HTTP ${response.status}）`);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (doc.querySelector('form[action*="/login"]') && !doc.querySelector('#browserItemList')) {
      throw new Error('登录状态已失效，请重新登录 Bangumi 后重试');
    }
    if (!doc.querySelector('#browserItemList') && !doc.querySelector('#columnSubjectBrowserA')) {
      throw new Error('收藏页面读取失败，请稍后重试');
    }
    const pageItems = parseCollectionDocument(doc, media, status);
    items.push(...pageItems);
    onPage?.({ url, count: pageItems.length, total: items.length });
    url = getNextPageUrl(doc, url);
  }

  return items;
}

export function mediaForRoute(route) {
  return route.kind === 'list' ? [route.media] : Object.keys(MEDIA);
}

const RELEASE_FIELDS = {
  anime: ['放送开始', '上映年度', '上映日期', '首播', '发售日', '发行日期'],
  book: ['发售日', '发行日期', '出版日期', '出版年', '连载开始'],
  music: ['发售日期', '发售日', '发行日期', '发行时间'],
  game: ['发行日期', '发售日', '发售日期'],
  real: ['开始', '放送开始', '上映年度', '上映日期', '首播', '发行日期'],
};

export function parseSubjectDate(doc, media) {
  const years = [];
  let pending = false;
  for (const field of doc.querySelectorAll('#infobox > li')) {
    const text = field.textContent.trim();
    const colon = text.search(/[:：]/);
    if (colon < 0 || !RELEASE_FIELDS[media]?.includes(text.slice(0, colon).trim())) continue;
    const value = text.slice(colon + 1).trim();
    const year = extractReleaseYear(value);
    if (year) years.push(year);
    else if (/^(?:\*|未定|待定|TBA|TBD)$/i.test(value)) pending = true;
  }
  return { year: years.length ? Math.min(...years) : null, dateState: years.length ? 'dated' : pending ? 'pending' : 'unknown' };
}

export async function completeSubjectDates(items, { fetchImpl = fetch, signal } = {}) {
  const result = items.map(item => ({ ...item }));
  const missing = result.filter(item => !item.year);
  let cursor = 0;
  async function worker() {
    while (cursor < missing.length) {
      const item = missing[cursor++];
      const response = await fetchImpl(new URL(`/subject/${item.subjectId}`, location.origin).href, {
        credentials: 'same-origin', headers: { Accept: 'text/html' }, signal,
      });
      if (!response.ok) throw new Error('作品日期读取失败，请稍后重试');
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (!doc.querySelector('#infobox')) throw new Error('作品日期读取失败，请稍后重试');
      Object.assign(item, parseSubjectDate(doc, item.media));
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, missing.length) }, worker));
  return result;
}

export function tasksForSelection(media, status) {
  if (!Object.hasOwn(MEDIA, media)) throw new Error('请选择作品类别');
  if (status !== 'all' && !STATUS_ORDER.includes(status)) throw new Error('请选择收藏状态');
  return (status === 'all' ? STATUS_ORDER : [status]).map(value => ({ media, status: value }));
}

export function distribution(items) {
  const unique = [...new Map(items.map(item => [`${item.media}:${item.subjectId}`, item])).values()];
  const counts = new Map();
  for (const item of unique) if (item.year) counts.set(item.year, (counts.get(item.year) || 0) + 1);
  return {
    total: unique.length,
    unknown: unique.filter(item => !item.year),
    rows: [...counts].sort(([a], [b]) => b - a).map(([year, count]) => ({ year, count, percent: count / unique.length * 100 })),
  };
}
