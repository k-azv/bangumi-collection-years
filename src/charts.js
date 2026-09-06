export const CHART_MODES = Object.freeze([
  ['decade', '年代柱状图'], ['year', '年度柱状图'], ['list', '年度条形图'],
]);
const PREFERENCE_KEY = 'bgmcy:chart-mode';
export function readChartMode(storage) {
  try {
    const saved = storage.getItem(PREFERENCE_KEY);
    return CHART_MODES.some(([key]) => key === saved) ? saved : 'decade';
  } catch { return 'decade'; }
}
export function saveChartMode(storage, mode) {
  if (!CHART_MODES.some(([key]) => key === mode)) return;
  try { storage.setItem(PREFERENCE_KEY, mode); } catch { /* optional preference */ }
}

export function histogramRows(rows, mode, decade = null) {
  if (!rows.length) return [];
  const counts = new Map(rows.map(row => [row.year, row.count]));
  const min = Math.min(...counts.keys()), max = Math.max(...counts.keys());
  const grouped = mode === 'decade' && decade === null;
  const step = grouped ? 10 : 1;
  const from = grouped ? Math.floor(min / 10) * 10 : decade ?? min;
  const to = grouped ? Math.floor(max / 10) * 10 : decade === null ? max : decade + 9;
  return Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, index) => {
    const year = from + index * step;
    let count = 0;
    for (let i = year; i < year + step; i++) count += counts.get(i) || 0;
    return { year, count };
  });
}

function node(tag, attrs = {}, text) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
}
function svgNode(tag, attrs = {}, text) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createHistogram(data, mode) {
  const root = node('div', { class: 'bgmcy-histogram' });
  const nav = node('div', { class: 'bgmcy-chart-nav' });
  const period = node('span');
  const back = node('button', { type: 'button' }, '返回全部年代');
  nav.append(period, back);
  const svg = svgNode('svg', { class: 'bgmcy-svg', role: 'img' });
  const plot = node('div', { class: 'bgmcy-plot' });
  const targets = node('div', { class: 'bgmcy-plot-targets' });
  plot.append(svg, targets);
  const detail = node('div', { class: 'bgmcy-chart-detail' });
  const previous = node('button', { type: 'button' }, '‹');
  const output = node('output', { 'aria-live': 'polite' });
  const next = node('button', { type: 'button' }, '›');
  detail.append(previous, output, next);
  root.append(nav, plot, detail);
  let decade = null;
  let rows = histogramRows(data.rows, mode);
  let selected = rows.findLast(row => row.count > 0)?.year ?? rows[0].year;
  let hovered = null;
  let disposed = false;

  function updateSelection() {
    const grouped = mode === 'decade' && decade === null;
    const row = rows.find(row => row.year === (hovered ?? selected)) || rows[0];
    output.textContent = `${grouped ? `${row.year}—${row.year + 9} 年` : `${row.year} 年`} · ${row.count} 部 · ${(row.count / data.total * 100).toFixed(1)}%`;
    previous.disabled = selected === rows[0].year;
    next.disabled = selected === rows.at(-1).year;
    previous.setAttribute('aria-label', grouped ? '前一个年代' : '前一年');
    next.setAttribute('aria-label', grouped ? '后一个年代' : '后一年');
    svg.querySelectorAll('.bgmcy-column').forEach(bar => bar.classList.toggle('is-selected', Number(bar.dataset.year) === row.year));
  }
  function draw() {
    if (disposed) return;
    rows = histogramRows(data.rows, mode, decade);
    const grouped = mode === 'decade' && decade === null;
    const width = svg.getBoundingClientRect().width || 250;
    const height = 196, left = 32, right = 8, top = 25, bottom = 38;
    const plotWidth = Math.max(1, width - left - right), plotHeight = height - top - bottom;
    const step = plotWidth / rows.length;
    const max = Math.max(1, ...rows.map(row => row.count));
    period.textContent = `${rows[0].year}—${rows.at(-1).year + (grouped ? 9 : 0)}`;
    back.hidden = !grouped && mode === 'decade' ? false : true;
    targets.replaceChildren();
    targets.style.gridTemplateColumns = `repeat(${rows.length}, minmax(0, 1fr))`;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('aria-label', `${period.textContent} ${grouped ? '年代' : '年份'}分布`);
    svg.replaceChildren();
    svg.append(svgNode('text', { x: left, y: 13 }, '作品数（部）'));
    for (const value of new Set([0, Math.ceil(max / 2), max])) {
      const y = top + plotHeight - value / max * plotHeight;
      svg.append(svgNode('line', { x1: left, x2: width - right, y1: y, y2: y, class: 'bgmcy-grid' }),
        svgNode('text', { x: left - 6, y: y + 4, 'text-anchor': 'end' }, value));
    }
    const tickEvery = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(plotWidth / 48))));
    rows.forEach((row, index) => {
      const gap = Math.min(4, step * .3), x = left + index * step + gap / 2;
      const h = row.count / max * plotHeight;
      {
        const description = `${row.year}${grouped ? '年代' : '年'}，${row.count}部，占${Number((row.count / data.total * 100).toFixed(1))}%`;
        const button = node('button', { type: 'button', 'aria-label': description, 'data-year': row.year });
        button.addEventListener('focus', () => { hovered = null; selected = row.year; updateSelection(); });
        button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') { hovered = row.year; updateSelection(); } });
        button.addEventListener('click', () => { hovered = null; selected = row.year; if (grouped) openDecade(); else updateSelection(); });
        targets.append(button);
      }
      svg.append(svgNode('rect', { x, y: top + plotHeight - h, width: Math.max(.1, step - gap), height: h,
        class: 'bgmcy-column', 'data-year': row.year, 'data-count': row.count }));
      if (grouped && step >= 30) svg.append(svgNode('text', { x: x + (step - gap) / 2, y: top + plotHeight - h - 6, 'text-anchor': 'middle', class: 'bgmcy-column-value' }, row.count));
      if (index % tickEvery === 0) svg.append(svgNode('text', { x: left + (index + .5) * step, y: top + plotHeight + 18, 'text-anchor': 'middle' }, row.year));
    });
    svg.append(svgNode('text', { x: width - right, y: height - 1, 'text-anchor': 'end' }, grouped ? '年代' : '年份'));
    svg.append(svgNode('rect', { x: left, y: top, width: plotWidth, height: plotHeight, class: 'bgmcy-chart-hit' }));
    updateSelection();
  }
  function stepSelection(delta) {
    hovered = null;
    const index = rows.findIndex(row => row.year === selected);
    selected = rows[Math.max(0, Math.min(rows.length - 1, index + delta))].year;
    updateSelection();
  }
  function openDecade() {
    if (mode !== 'decade' || decade !== null) return;
    decade = selected;
    hovered = null;
    selected = histogramRows(data.rows, mode, decade).findLast(row => row.count > 0)?.year ?? decade;
    draw();
  }
  previous.addEventListener('click', () => stepSelection(-1));
  next.addEventListener('click', () => stepSelection(1));
  back.addEventListener('click', () => { hovered = null; selected = decade; decade = null; draw(); });
  targets.addEventListener('pointerleave', () => { hovered = null; updateSelection(); });
  root.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    stepSelection(event.key === 'ArrowLeft' ? -1 : 1);
  });
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
  observer?.observe(svg);
  draw();
  return { root, destroy() { disposed = true; observer?.disconnect(); } };
}
