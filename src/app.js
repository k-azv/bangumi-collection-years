import {
  MEDIA, STATUS_LABELS, STATUS_ORDER, completeSubjectDates, distribution,
  fetchCollectionPages, getSignedInUsername, parseCollectionDocument, parseRoute, tasksForSelection,
} from './core.js';
import { createCache } from './cache.js';
import { CHART_MODES, createHistogram, readChartMode, saveChartMode } from './charts.js';

const COMPONENT_ID = 'bgm-collection-years';

function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('aria-')) node.setAttribute(key, value);
    else node[key] = value;
  }
  node.append(...children);
  return node;
}

function mountRoot(root, route) {
  const sidebar = document.querySelector(route.kind === 'profile' ? '#columnB' : '#columnSubjectBrowserB, #columnB');
  if (!sidebar) return false;
  const heatmap = sidebar.querySelector('#wiki-heatmap-stats-wrapper');
  if (heatmap) heatmap.after(root);
  else sidebar.prepend(root);
  // Some mobile themes hide the desktop sidebar. Keep the component in the normal page flow there.
  const mobile = window.matchMedia?.('(max-width: 640px)');
  const place = () => {
    const main = document.querySelector(route.kind === 'profile' ? '#user_home' : '#columnSubjectBrowserA, #columnA');
    if (mobile?.matches && main) main.prepend(root);
    else if (heatmap?.isConnected) heatmap.after(root);
    else sidebar.prepend(root);
  };
  place();
  mobile?.addEventListener('change', place);
  // Other components can insert the heatmap after this script has run.
  const observer = new MutationObserver(() => {
    if (mobile?.matches) return;
    const map = sidebar.querySelector('#wiki-heatmap-stats-wrapper');
    if (map && map.nextElementSibling !== root) map.after(root);
  });
  observer.observe(sidebar, { childList: true });
  return true;
}

function select(label, options, value) {
  const node = element('select', { 'aria-label': label });
  node.append(...options.map(([key, text]) => element('option', { value: key, text })));
  node.value = value;
  return node;
}

function renderChart(body, items, mode) {
  const data = distribution(items);
  const summary = element('p', { class: 'bgmcy-summary' }, [
    element('strong', { text: String(data.total) }), document.createTextNode(' 部作品'),
  ]);
  const chart = element('div', { class: 'bgmcy-chart', role: 'list', 'aria-label': '年份分布' });
  const max = Math.max(1, ...data.rows.map(row => row.count));
  for (const row of data.rows) {
    const fill = element('span', { class: 'bgmcy-fill' });
    fill.style.width = `${row.count / max * 100}%`;
    const percent = `${Number(row.percent.toFixed(1))}%`;
    chart.append(element('div', { class: 'bgmcy-row', role: 'listitem', 'aria-label': `${row.year}年，${row.count}部，占${percent}` }, [
      element('time', { text: String(row.year), dateTime: String(row.year) }),
      element('div', { class: 'bgmcy-bar', 'aria-hidden': 'true' }, [fill]),
      element('span', { class: 'bgmcy-count', text: String(row.count) }),
      element('span', { class: 'bgmcy-percent', text: percent }),
    ]));
  }
  const histogram = mode !== 'list' && data.rows.length ? createHistogram(data, mode) : null;
  const children = [summary, ...(histogram ? [histogram.root] : mode === 'list' ? [chart] : [])];
  if (!data.total) children.push(element('p', { class: 'bgmcy-empty', text: '暂无收藏' }));
  if (data.unknown.length) {
    const details = element('details', { class: 'bgmcy-unknown' }, [
      element('summary', { text: `年份待确认 · ${data.unknown.length} 部` }),
    ]);
    const list = element('ul');
    for (const item of data.unknown) list.append(element('li', {}, [
      element('a', { href: `/subject/${item.subjectId}`, text: item.title || `#${item.subjectId}` }),
      document.createTextNode(item.dateState === 'pending' ? ' · 待定' : ' · 日期待补充'),
    ]));
    details.append(list);
    children.push(details);
  }
  body.replaceChildren(...children);
  return () => histogram?.destroy();
}

export function run() {
  if (document.getElementById(COMPONENT_ID) || window !== window.top) return;
  const route = parseRoute(location.pathname);
  if (!route) return;
  const viewer = getSignedInUsername(document);
  let storage;
  try { storage = window.localStorage; } catch { /* unavailable */ }
  const cache = createCache(storage, viewer, route.username);
  let mode = readChartMode(storage);
  let media = route.media || 'anime';
  let status = route.status || 'all';
  const root = element('section', { id: COMPONENT_ID, class: 'bgmcy-card' });
  const refresh = element('button', { type: 'button', class: 'bgmcy-refresh', text: '刷新', 'aria-label': '刷新收藏统计' });
  const heading = element('div', { class: 'bgmcy-heading' }, [element('h2', { text: '收藏作品年代' }), refresh]);
  const filters = element('div', { class: 'bgmcy-filters' });
  const mediaSelect = select('收藏类别', Object.entries(MEDIA).map(([key, value]) => [key, value.label]), media);
  const statusSelect = select('收藏状态', [], status);
  const updateStatusOptions = () => {
    const labels = STATUS_LABELS[media];
    statusSelect.replaceChildren(...[['all', '概览'], ...STATUS_ORDER.map(key => [key, labels[key]])].map(([value, text]) => element('option', { value, text })));
    statusSelect.value = status;
  };
  updateStatusOptions();
  if (route.kind === 'profile') filters.append(mediaSelect);
  else filters.append(element('span', { class: 'bgmcy-media', text: MEDIA[media].label }));
  filters.append(statusSelect);
  const modeSelect = select('图表类型', CHART_MODES, mode);
  const displayOptions = element('div', { class: 'bgmcy-display-options' }, [modeSelect]);
  const body = element('div', { class: 'bgmcy-body' });
  const message = element('p', { class: 'bgmcy-status', 'aria-live': 'polite', hidden: true });
  root.append(heading, filters, displayOptions, body, message);
  if (!mountRoot(root, route)) return;

  function checkCurrentPage() {
    const affected = new Set();
    // Counts on the profile and status tabs detect additions/removals between visits.
    for (const link of document.querySelectorAll('a[href*="/list/"]')) {
      const linked = parseRoute(new URL(link.href, location.origin).pathname);
      if (!linked?.status || linked.username !== route.username) continue;
      const count = link.textContent.match(/(?:\(|\s)(\d+)\)?\s*$/)?.[1];
      const saved = cache.read(linked.media, linked.status);
      if (saved && count !== undefined && Number(count) !== saved.items.length) affected.add(linked.media);
    }
    if (route.kind === 'list' && route.status) {
      const saved = cache.read(route.media, route.status);
      const current = parseCollectionDocument(document, route.media, route.status);
      if (saved && current.some(item => !saved.items.some(old => old.subjectId === item.subjectId && old.private === item.private && (!item.year || old.year === item.year)))) affected.add(route.media);
    }
    for (const key of affected) cache.invalidate(key);
    return affected.size > 0;
  }
  checkCurrentPage();
  let generation = 0;
  let controller;
  let alive = true;
  let visibleItems = null;
  let destroyChart = () => {};
  function display(items) {
    visibleItems = items;
    destroyChart();
    destroyChart = renderChart(body, items, mode);
  }
  modeSelect.addEventListener('change', () => {
    mode = modeSelect.value;
    saveChartMode(storage, mode);
    if (visibleItems !== null) display(visibleItems);
  });
  function showMessage(text) { message.textContent = text; message.hidden = !text; }
  async function load(force = false) {
    const current = ++generation;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const tasks = tasksForSelection(media, status);
    const saved = tasks.map(task => cache.read(task.media, task.status));
    const hasAll = saved.every(Boolean);
    if (hasAll) display(saved.flatMap(data => data.items));
    else { visibleItems = null; destroyChart(); body.replaceChildren(); }
    if (!force && hasAll && saved.every(data => data.fresh)) {
      refresh.disabled = false;
      showMessage('');
      return;
    }
    refresh.disabled = true;
    showMessage(hasAll ? '更新中…' : '加载中…');
    let cursor = 0;
    try {
      const results = new Array(tasks.length);
      async function worker() {
        while (cursor < tasks.length) {
          const index = cursor++;
          const task = tasks[index];
          if (!force && saved[index]?.fresh) results[index] = saved[index].items;
          else {
            const items = await fetchCollectionPages({ ...task, username: route.username, signal });
            const completed = await completeSubjectDates(items, { signal });
            if (signal.aborted) return;
            cache.write(task.media, task.status, completed);
            results[index] = completed;
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, worker));
      if (current !== generation || !alive) return;
      display(results.flat());
      showMessage('');
    } catch (error) {
      if (current !== generation || !alive) return;
      controller.abort();
      showMessage(hasAll ? '更新失败，显示上次结果。请点击刷新重试。' : (error.message || '加载失败，请点击刷新重试。'));
    } finally {
      if (current === generation) refresh.disabled = false;
    }
  }
  mediaSelect.addEventListener('change', () => { media = mediaSelect.value; status = 'all'; updateStatusOptions(); load(); });
  statusSelect.addEventListener('change', () => { status = statusSelect.value; load(); });
  refresh.addEventListener('click', () => load(true));
  // Collection-list changes are observed after Bangumi updates the actual DOM.
  const list = document.querySelector('#browserItemList');
  let timer;
  if (list) {
    const fingerprint = () => Array.from(list.children).map(item => [item.id, item.querySelector('p.info')?.textContent, item.querySelector('.collectInfo')?.textContent]);
    let previous = JSON.stringify(fingerprint());
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const current = JSON.stringify(fingerprint());
        if (current === previous) return;
        previous = current;
        cache.invalidate(route.media);
        load();
      }, 500);
    });
    observer.observe(list, { childList: true, subtree: true, characterData: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { checkCurrentPage(); load(); }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { alive = true; checkCurrentPage(); load(); } });
  window.addEventListener('pagehide', () => { alive = false; controller?.abort(); clearTimeout(timer); });
  load();
}
run();
