import {
  MEDIA,
  STATUS_LABELS,
  STATUS_ORDER,
  aggregateCollections,
  fetchCollectionPages,
  getSignedInUsername,
  mediaForRoute,
  parseRoute,
} from './core.js';

const COMPONENT_ID = 'bgm-collection-years';
const STATUS_COLORS = Object.freeze({
  wish: '#72a7c9',
  collect: '#f09199',
  do: '#80b978',
  on_hold: '#c9a65d',
  dropped: '#9a9a9a',
});

function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('aria-')) node.setAttribute(key, value);
    else node[key] = value;
  }
  for (const child of children) node.append(child);
  return node;
}

function getMount(route) {
  if (route.kind === 'profile') {
    const home = document.querySelector('#user_home');
    return home ? { parent: home, before: home.querySelector('.section.sort') } : null;
  }
  const column = document.querySelector('#columnSubjectBrowserA');
  const list = column?.querySelector('#browserItemList');
  return column && list ? { parent: column, before: list } : null;
}

function statusLabel(media, status, combined) {
  if (combined) return { wish: '想收藏', collect: '已完成', do: '进行中', on_hold: '搁置', dropped: '抛弃' }[status];
  return STATUS_LABELS[media][status];
}

function formatProgress(state) {
  if (state.phase === 'waiting') return '读取各收藏页的作品资料，统计只在本页内存中处理。';
  if (state.phase === 'loading') return `正在读取 ${state.finished}/${state.total} 个收藏分类 · ${state.pages} 页`;
  if (state.phase === 'error') return state.error;
  return '';
}

function createShell(route, ownProfile) {
  const root = element('section', { id: COMPONENT_ID, class: 'bgmcy-card' });
  const title = route.kind === 'profile' ? '收藏作品年代' : `${MEDIA[route.media].label}作品年代`;
  const subtitle = ownProfile
    ? '按作品发行年份统计，包含自己可见的收藏'
    : '按作品发行年份与当前账号可见范围统计';
  const heading = element('div', { class: 'bgmcy-heading' }, [
    element('h2', { text: title }),
    element('span', { class: 'bgmcy-subtitle', text: subtitle }),
  ]);
  const body = element('div', { class: 'bgmcy-body' });
  const status = element('p', { class: 'bgmcy-status', text: formatProgress({ phase: 'waiting' }), 'aria-live': 'polite' });
  const loadButton = element('button', { type: 'button', class: 'chiiBtn bgmcy-load' }, [element('span', { text: '加载收藏统计' })]);
  root.append(heading, body, element('div', { class: 'bgmcy-actions' }, [status, loadButton]));
  return { root, body, status, loadButton };
}

function createTabs(mediaKeys, active, onSelect) {
  if (mediaKeys.length < 2) return null;
  const tabs = element('div', { class: 'bgmcy-tabs', role: 'tablist', 'aria-label': '收藏类别' });
  const choices = [['all', '全部'], ...mediaKeys.map(key => [key, MEDIA[key].label])];
  for (const [key, label] of choices) {
    const button = element('button', {
      type: 'button',
      class: `bgmcy-tab${key === active ? ' is-active' : ''}`,
      text: label,
      role: 'tab',
      'aria-selected': String(key === active),
    });
    button.addEventListener('click', () => onSelect(key));
    tabs.append(button);
  }
  return tabs;
}

function renderChart(container, items, mediaKey) {
  container.replaceChildren();
  const combined = mediaKey === 'all';
  const selected = new Set(STATUS_ORDER);

  function draw() {
    const filtered = combined ? items : items.filter(item => item.media === mediaKey);
    const data = aggregateCollections(filtered);
    const visibleTotal = data.years.reduce((sum, row) => sum + STATUS_ORDER.reduce((n, status) => n + (selected.has(status) ? row.statuses[status] : 0), 0), 0);
    const max = Math.max(1, ...data.years.map(row => STATUS_ORDER.reduce((n, status) => n + (selected.has(status) ? row.statuses[status] : 0), 0)));
    const chart = element('div', { class: 'bgmcy-chart' });
    const summary = element('div', { class: 'bgmcy-summary' }, [
      element('strong', { text: String(visibleTotal) }),
      element('span', { text: ` 部有发行年份 · 共 ${data.total} 部` }),
    ]);
    const legend = element('div', { class: 'bgmcy-legend', 'aria-label': '筛选收藏状态' });

    for (const status of STATUS_ORDER) {
      const count = filtered.filter(item => item.status === status).length;
      const button = element('button', {
        type: 'button',
        class: `bgmcy-legend-item${selected.has(status) ? ' is-active' : ''}`,
        'aria-pressed': String(selected.has(status)),
      }, [
        element('i', { class: 'bgmcy-dot' }),
        element('span', { text: `${statusLabel(combined ? 'anime' : mediaKey, status, combined)} ${count}` }),
      ]);
      button.style.setProperty('--bgmcy-color', STATUS_COLORS[status]);
      button.addEventListener('click', () => {
        if (selected.has(status) && selected.size > 1) selected.delete(status);
        else selected.add(status);
        draw();
      });
      legend.append(button);
    }

    for (const row of data.years) {
      const rowTotal = STATUS_ORDER.reduce((sum, status) => sum + (selected.has(status) ? row.statuses[status] : 0), 0);
      if (!rowTotal) continue;
      const bar = element('div', { class: 'bgmcy-bar', title: `${row.year} · ${rowTotal} 条` });
      for (const status of STATUS_ORDER) {
        const count = selected.has(status) ? row.statuses[status] : 0;
        if (!count) continue;
        const segment = element('span', { class: 'bgmcy-segment' });
        segment.style.width = `${(count / max) * 100}%`;
        segment.style.backgroundColor = STATUS_COLORS[status];
        segment.title = `${statusLabel(combined ? 'anime' : mediaKey, status, combined)} ${count}`;
        bar.append(segment);
      }
      chart.append(element('div', { class: 'bgmcy-row' }, [
        element('time', { text: String(row.year), dateTime: String(row.year) }),
        bar,
        element('span', { class: 'bgmcy-count', text: String(rowTotal) }),
      ]));
    }

    if (!data.years.length) chart.append(element('p', { class: 'bgmcy-empty', text: '这些作品还没有可统计的发行年份。' }));
    if (data.unknown) chart.append(element('p', { class: 'bgmcy-note', text: `${data.unknown} 部作品的站点资料缺少发行年份，归入年份未知。` }));
    container.replaceChildren(summary, legend, chart);
  }

  draw();
}

async function run() {
  if (document.getElementById(COMPONENT_ID)) return;
  const route = parseRoute(location.pathname);
  if (!route || window !== window.top) return;
  const mount = getMount(route);
  if (!mount) return;
  const ownProfile = getSignedInUsername(document) === route.username;
  const ui = createShell(route, ownProfile);
  mount.parent.insertBefore(ui.root, mount.before);

  ui.loadButton.addEventListener('click', async () => {
    ui.loadButton.disabled = true;
    ui.loadButton.querySelector('span').textContent = '读取中';
    const mediaKeys = mediaForRoute(route);
    const tasks = mediaKeys.flatMap(media => STATUS_ORDER.map(status => ({ media, status })));
    const state = { phase: 'loading', finished: 0, total: tasks.length, pages: 0 };
    ui.status.textContent = formatProgress(state);
    const controller = new AbortController();

    try {
      const results = new Array(tasks.length);
      let cursor = 0;
      async function worker() {
        while (cursor < tasks.length) {
          const index = cursor++;
          const task = tasks[index];
          results[index] = await fetchCollectionPages({
            ...task,
            username: route.username,
            signal: controller.signal,
            onPage: () => {
              state.pages += 1;
              ui.status.textContent = formatProgress(state);
            },
          });
          state.finished += 1;
          ui.status.textContent = formatProgress(state);
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, worker));
      const items = results.flat();
      let active = route.kind === 'list' ? route.media : 'all';
      const content = element('div');
      const rerender = key => {
        active = key;
        ui.body.querySelectorAll('.bgmcy-tab').forEach((tab, index) => {
          const tabKey = index === 0 ? 'all' : mediaKeys[index - 1];
          tab.classList.toggle('is-active', tabKey === active);
          tab.setAttribute('aria-selected', String(tabKey === active));
        });
        renderChart(content, items, active);
      };
      const tabs = createTabs(mediaKeys, active, rerender);
      ui.body.replaceChildren(...(tabs ? [tabs] : []), content);
      renderChart(content, items, active);
      ui.status.textContent = ownProfile
        ? '统计完成 · 自己可见记录已按登录权限计入'
        : '统计完成 · 结果按当前账号可见范围生成';
      ui.loadButton.remove();
    } catch (error) {
      state.phase = 'error';
      state.error = error instanceof Error ? error.message : '读取收藏失败，请稍后重试';
      ui.status.textContent = formatProgress(state);
      ui.loadButton.disabled = false;
      ui.loadButton.querySelector('span').textContent = '重新加载';
    }
  });
}

run();
