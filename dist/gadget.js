// ==UserScript==
// @name         Bangumi 收藏作品年代
// @namespace    https://github.com/k-azv/bangumi-collection-years
// @version      0.3.0
// @description  按作品发行年份查看动画、书籍、音乐、游戏与三次元收藏
// @author       k-azv
// @include      /^https?:\/\/(bgm\.tv|bangumi\.tv|chii\.in)\/user\/[^/?#]+\/?$/
// @include      /^https?:\/\/(bgm\.tv|bangumi\.tv|chii\.in)\/(anime|book|music|game|real)\/list\/[^/?#]+(?:\/(wish|collect|do|on_hold|dropped))?\/?(?:[?#].*)?$/
// ==/UserScript==
(() => {
  // src/core.js
  var MEDIA = Object.freeze({
    anime: { label: "\u52A8\u753B", order: 0 },
    book: { label: "\u4E66\u7C4D", order: 1 },
    music: { label: "\u97F3\u4E50", order: 2 },
    game: { label: "\u6E38\u620F", order: 3 },
    real: { label: "\u4E09\u6B21\u5143", order: 4 }
  });
  var STATUS_ORDER = Object.freeze(["wish", "collect", "do", "on_hold", "dropped"]);
  var STATUS_LABELS = Object.freeze({
    anime: { wish: "\u60F3\u770B", collect: "\u770B\u8FC7", do: "\u5728\u770B", on_hold: "\u6401\u7F6E", dropped: "\u629B\u5F03" },
    book: { wish: "\u60F3\u8BFB", collect: "\u8BFB\u8FC7", do: "\u5728\u8BFB", on_hold: "\u6401\u7F6E", dropped: "\u629B\u5F03" },
    music: { wish: "\u60F3\u542C", collect: "\u542C\u8FC7", do: "\u5728\u542C", on_hold: "\u6401\u7F6E", dropped: "\u629B\u5F03" },
    game: { wish: "\u60F3\u73A9", collect: "\u73A9\u8FC7", do: "\u5728\u73A9", on_hold: "\u6401\u7F6E", dropped: "\u629B\u5F03" },
    real: { wish: "\u60F3\u770B", collect: "\u770B\u8FC7", do: "\u5728\u770B", on_hold: "\u6401\u7F6E", dropped: "\u629B\u5F03" }
  });
  var ROUTE_RE = /^\/(anime|book|music|game|real)\/list\/([^/?#]+)(?:\/(wish|collect|do|on_hold|dropped))?\/?$/;
  var PROFILE_RE = /^\/user\/([^/?#]+)\/?$/;
  var RELEASE_YEAR_RE = /^(?:\d+\s*话\s*\/\s*)?((?:18|19|20|21)\d{2})(?=[-年]|\b)/;
  function extractReleaseYear(subjectInfo) {
    const match = subjectInfo.match(RELEASE_YEAR_RE);
    return match ? Number(match[1]) : null;
  }
  function parseRoute(pathname) {
    const list = pathname.match(ROUTE_RE);
    if (list) {
      return { kind: "list", media: list[1], username: decodeURIComponent(list[2]), status: list[3] || null };
    }
    const profile = pathname.match(PROFILE_RE);
    if (profile) {
      return { kind: "profile", media: null, username: decodeURIComponent(profile[1]), status: null };
    }
    return null;
  }
  function getSignedInUsername(doc = document) {
    const href = doc.querySelector('#dock li.first a[href*="/user/"]')?.getAttribute("href");
    if (!href) return null;
    try {
      const path = new URL(href, location.origin).pathname;
      return decodeURIComponent(path.match(/^\/user\/([^/]+)/)?.[1] || "") || null;
    } catch {
      return null;
    }
  }
  function parseCollectionDocument(doc, media, status) {
    const items = [];
    for (const element2 of doc.querySelectorAll("#browserItemList > li")) {
      const subjectId = element2.id.match(/^item_(\d+)$/)?.[1];
      if (!subjectId) continue;
      const subjectInfo = element2.querySelector("p.info.tip")?.textContent?.trim() || "";
      const collectionInfo = element2.querySelector(".collectInfo")?.textContent?.trim() || "";
      items.push({
        subjectId,
        title: element2.querySelector("h3 a")?.textContent?.trim() || `#${subjectId}`,
        media,
        status,
        year: extractReleaseYear(subjectInfo),
        private: /自己可见/.test(collectionInfo)
      });
    }
    return items;
  }
  function getNextPageUrl(doc, currentUrl) {
    const current = doc.querySelector(".page_inner .p_cur");
    const next = current?.nextElementSibling;
    if (!next?.matches("a.p[href]")) return null;
    return new URL(next.getAttribute("href"), currentUrl).href;
  }
  async function fetchCollectionPages({ media, username, status, fetchImpl = fetch, onPage, signal }) {
    let url = new URL(`/${media}/list/${encodeURIComponent(username)}/${status}`, location.origin).href;
    const items = [];
    const visited = /* @__PURE__ */ new Set();
    while (url && !visited.has(url)) {
      visited.add(url);
      let response;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          response = await fetchImpl(url, {
            credentials: "same-origin",
            headers: { Accept: "text/html" },
            signal
          });
          if (response.ok || response.status < 500 || attempt === 2) break;
        } catch (error) {
          if (signal?.aborted || attempt === 2) throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
      if (!response.ok) throw new Error(`\u8BFB\u53D6\u6536\u85CF\u5931\u8D25\uFF08HTTP ${response.status}\uFF09`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (doc.querySelector('form[action*="/login"]') && !doc.querySelector("#browserItemList")) {
        throw new Error("\u767B\u5F55\u72B6\u6001\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55 Bangumi \u540E\u91CD\u8BD5");
      }
      if (!doc.querySelector("#browserItemList") && !doc.querySelector("#columnSubjectBrowserA")) {
        throw new Error("\u6536\u85CF\u9875\u9762\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
      }
      const pageItems = parseCollectionDocument(doc, media, status);
      items.push(...pageItems);
      onPage?.({ url, count: pageItems.length, total: items.length });
      url = getNextPageUrl(doc, url);
    }
    return items;
  }
  var RELEASE_FIELDS = {
    anime: ["\u653E\u9001\u5F00\u59CB", "\u4E0A\u6620\u5E74\u5EA6", "\u4E0A\u6620\u65E5\u671F", "\u9996\u64AD", "\u53D1\u552E\u65E5", "\u53D1\u884C\u65E5\u671F"],
    book: ["\u53D1\u552E\u65E5", "\u53D1\u884C\u65E5\u671F", "\u51FA\u7248\u65E5\u671F", "\u51FA\u7248\u5E74", "\u8FDE\u8F7D\u5F00\u59CB"],
    music: ["\u53D1\u552E\u65E5\u671F", "\u53D1\u552E\u65E5", "\u53D1\u884C\u65E5\u671F", "\u53D1\u884C\u65F6\u95F4"],
    game: ["\u53D1\u884C\u65E5\u671F", "\u53D1\u552E\u65E5", "\u53D1\u552E\u65E5\u671F"],
    real: ["\u5F00\u59CB", "\u653E\u9001\u5F00\u59CB", "\u4E0A\u6620\u5E74\u5EA6", "\u4E0A\u6620\u65E5\u671F", "\u9996\u64AD", "\u53D1\u884C\u65E5\u671F"]
  };
  function parseSubjectDate(doc, media) {
    const years = [];
    let pending = false;
    for (const field of doc.querySelectorAll("#infobox > li")) {
      const text = field.textContent.trim();
      const colon = text.search(/[:：]/);
      if (colon < 0 || !RELEASE_FIELDS[media]?.includes(text.slice(0, colon).trim())) continue;
      const value = text.slice(colon + 1).trim();
      const year = extractReleaseYear(value);
      if (year) years.push(year);
      else if (/^(?:\*|未定|待定|TBA|TBD)$/i.test(value)) pending = true;
    }
    return { year: years.length ? Math.min(...years) : null, dateState: years.length ? "dated" : pending ? "pending" : "unknown" };
  }
  async function completeSubjectDates(items, { fetchImpl = fetch, signal } = {}) {
    const result = items.map((item) => ({ ...item }));
    const missing = result.filter((item) => !item.year);
    let cursor = 0;
    async function worker() {
      while (cursor < missing.length) {
        const item = missing[cursor++];
        const response = await fetchImpl(new URL(`/subject/${item.subjectId}`, location.origin).href, {
          credentials: "same-origin",
          headers: { Accept: "text/html" },
          signal
        });
        if (!response.ok) throw new Error("\u4F5C\u54C1\u65E5\u671F\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        if (!doc.querySelector("#infobox")) throw new Error("\u4F5C\u54C1\u65E5\u671F\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
        Object.assign(item, parseSubjectDate(doc, item.media));
      }
    }
    await Promise.all(Array.from({ length: Math.min(2, missing.length) }, worker));
    return result;
  }
  function tasksForSelection(media, status) {
    if (!Object.hasOwn(MEDIA, media)) throw new Error("\u8BF7\u9009\u62E9\u4F5C\u54C1\u7C7B\u522B");
    if (status !== "all" && !STATUS_ORDER.includes(status)) throw new Error("\u8BF7\u9009\u62E9\u6536\u85CF\u72B6\u6001");
    return (status === "all" ? STATUS_ORDER : [status]).map((value) => ({ media, status: value }));
  }
  function distribution(items) {
    const unique = [...new Map(items.map((item) => [`${item.media}:${item.subjectId}`, item])).values()];
    const counts = /* @__PURE__ */ new Map();
    for (const item of unique) if (item.year) counts.set(item.year, (counts.get(item.year) || 0) + 1);
    return {
      total: unique.length,
      unknown: unique.filter((item) => !item.year),
      rows: [...counts].sort(([a], [b]) => b - a).map(([year, count]) => ({ year, count, percent: count / unique.length * 100 }))
    };
  }

  // src/cache.js
  var CACHE_TTL = 6 * 60 * 60 * 1e3;
  var PREFIX = "bgmcy:v2:";
  function createCache(storage, viewer, username, now = Date.now) {
    const scope = `${PREFIX}${encodeURIComponent(viewer || "guest")}:${encodeURIComponent(username)}:`;
    const key = (media, status) => `${scope}${media}:${status}`;
    function read(media, status) {
      try {
        const data = JSON.parse(storage.getItem(key(media, status)));
        if (!data || !Number.isFinite(data.at) || !Array.isArray(data.items) || !data.items.every((item) => item.media === media && item.status === status && /^\d+$/.test(item.subjectId) && (item.year === null || Number.isInteger(item.year)))) return null;
        return { ...data, fresh: now() >= data.at && now() - data.at < CACHE_TTL };
      } catch {
        return null;
      }
    }
    function write(media, status, items) {
      try {
        storage.setItem(key(media, status), JSON.stringify({ at: now(), items }));
      } catch {
      }
    }
    function invalidate(media) {
      try {
        for (let i = storage.length - 1; i >= 0; i--) {
          const name = storage.key(i);
          if (name?.startsWith(`${scope}${media}:`)) storage.removeItem(name);
        }
      } catch {
      }
    }
    return { read, write, invalidate };
  }

  // src/charts.js
  var CHART_MODES = Object.freeze([
    ["decade", "\u5E74\u4EE3\u67F1\u72B6\u56FE"],
    ["year", "\u5E74\u5EA6\u67F1\u72B6\u56FE"],
    ["list", "\u5E74\u5EA6\u6761\u5F62\u56FE"]
  ]);
  var PREFERENCE_KEY = "bgmcy:chart-mode";
  function readChartMode(storage) {
    try {
      const saved = storage.getItem(PREFERENCE_KEY);
      return CHART_MODES.some(([key]) => key === saved) ? saved : "decade";
    } catch {
      return "decade";
    }
  }
  function saveChartMode(storage, mode) {
    if (!CHART_MODES.some(([key]) => key === mode)) return;
    try {
      storage.setItem(PREFERENCE_KEY, mode);
    } catch {
    }
  }
  function histogramRows(rows, mode, decade = null) {
    if (!rows.length) return [];
    const counts = new Map(rows.map((row) => [row.year, row.count]));
    const min = Math.min(...counts.keys()), max = Math.max(...counts.keys());
    const grouped = mode === "decade" && decade === null;
    const step = grouped ? 10 : 1;
    const from = grouped ? Math.floor(min / 10) * 10 : decade ?? min;
    const to = grouped ? Math.floor(max / 10) * 10 : decade === null ? max : Math.min(decade + 9, max);
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
    if (text !== void 0) el.textContent = text;
    return el;
  }
  function svgNode(tag, attrs = {}, text) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    if (text !== void 0) el.textContent = text;
    return el;
  }
  function createHistogram(data, mode) {
    const root = node("div", { class: "bgmcy-histogram" });
    const nav = node("div", { class: "bgmcy-chart-nav" });
    const period = node("span");
    const back = node("button", { type: "button" }, "\u8FD4\u56DE\u5168\u90E8\u5E74\u4EE3");
    nav.append(period, back);
    const svg = svgNode("svg", { class: "bgmcy-svg", role: "img" });
    const detail = node("div", { class: "bgmcy-chart-detail" });
    const previous = node("button", { type: "button" }, "\u2039");
    const output = node("output", { "aria-live": "polite" });
    const next = node("button", { type: "button" }, "\u203A");
    detail.append(previous, output, next);
    const open = node("button", { type: "button", class: "bgmcy-open-decade" }, "\u67E5\u770B\u5404\u5E74");
    const slider = node("input", { type: "range", step: "1", "aria-label": "\u9009\u62E9\u5E74\u4EFD" });
    root.append(nav, svg, detail, open, slider);
    let decade = null;
    let rows = histogramRows(data.rows, mode);
    let selected = rows.reduce((a, b) => b.count > a.count ? b : a).year;
    let geometry;
    let disposed = false;
    function updateSelection() {
      const grouped = mode === "decade" && decade === null;
      const row = rows.find((row2) => row2.year === selected) || rows[0];
      selected = row.year;
      output.textContent = `${row.year}${grouped ? "\u5E74\u4EE3" : "\u5E74"} \xB7 ${row.count} \u90E8 \xB7 ${Number((row.count / data.total * 100).toFixed(1))}%`;
      previous.disabled = row.year === rows[0].year;
      next.disabled = row.year === rows.at(-1).year;
      previous.setAttribute("aria-label", grouped ? "\u524D\u4E00\u4E2A\u5E74\u4EE3" : "\u524D\u4E00\u5E74");
      next.setAttribute("aria-label", grouped ? "\u540E\u4E00\u4E2A\u5E74\u4EE3" : "\u540E\u4E00\u5E74");
      slider.value = selected;
      svg.querySelectorAll(".bgmcy-column").forEach((bar) => bar.classList.toggle("is-selected", Number(bar.dataset.year) === selected));
    }
    function draw() {
      if (disposed) return;
      rows = histogramRows(data.rows, mode, decade);
      const grouped = mode === "decade" && decade === null;
      const width = svg.getBoundingClientRect().width || 250;
      const height = 196, left = 32, right = 8, top = 25, bottom = 38;
      const plotWidth = Math.max(1, width - left - right), plotHeight = height - top - bottom;
      const step = plotWidth / rows.length;
      const max = Math.max(1, ...rows.map((row) => row.count));
      geometry = { left, step, plotWidth };
      period.textContent = `${rows[0].year}\u2014${rows.at(-1).year + (grouped ? 9 : 0)}`;
      back.hidden = !grouped && mode === "decade" ? false : true;
      open.hidden = !grouped;
      slider.hidden = grouped;
      slider.min = rows[0].year;
      slider.max = rows.at(-1).year;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("aria-label", `${period.textContent} ${grouped ? "\u5E74\u4EE3" : "\u5E74\u4EFD"}\u5206\u5E03`);
      svg.replaceChildren(svgNode("title", {}, `${period.textContent}\u4F5C\u54C1\u5206\u5E03`));
      svg.append(svgNode("text", { x: left, y: 13 }, "\u4F5C\u54C1\u6570\uFF08\u90E8\uFF09"));
      for (const value of /* @__PURE__ */ new Set([0, Math.ceil(max / 2), max])) {
        const y = top + plotHeight - value / max * plotHeight;
        svg.append(
          svgNode("line", { x1: left, x2: width - right, y1: y, y2: y, class: "bgmcy-grid" }),
          svgNode("text", { x: left - 6, y: y + 4, "text-anchor": "end" }, value)
        );
      }
      const tickEvery = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(plotWidth / 48))));
      rows.forEach((row, index) => {
        const gap = Math.min(4, step * 0.3), x = left + index * step + gap / 2;
        const h = row.count / max * plotHeight;
        svg.append(svgNode("rect", {
          x,
          y: top + plotHeight - h,
          width: Math.max(0.1, step - gap),
          height: h,
          class: "bgmcy-column",
          "data-year": row.year,
          "data-count": row.count
        }));
        if (grouped && step >= 30) svg.append(svgNode("text", { x: x + (step - gap) / 2, y: top + plotHeight - h - 6, "text-anchor": "middle", class: "bgmcy-column-value" }, row.count));
        if (index % tickEvery === 0) svg.append(svgNode("text", { x: left + (index + 0.5) * step, y: top + plotHeight + 18, "text-anchor": "middle" }, row.year));
      });
      svg.append(svgNode("text", { x: width - right, y: height - 1, "text-anchor": "end" }, grouped ? "\u5E74\u4EE3" : "\u5E74\u4EFD"));
      svg.append(svgNode("rect", { x: left, y: top, width: plotWidth, height: plotHeight, class: "bgmcy-chart-hit" }));
      updateSelection();
    }
    function stepSelection(delta) {
      const index = rows.findIndex((row) => row.year === selected);
      selected = rows[Math.max(0, Math.min(rows.length - 1, index + delta))].year;
      updateSelection();
    }
    function openDecade() {
      if (mode !== "decade" || decade !== null) return;
      decade = selected;
      selected = histogramRows(data.rows, mode, decade).reduce((a, b) => b.count > a.count ? b : a).year;
      draw();
    }
    previous.addEventListener("click", () => stepSelection(-1));
    next.addEventListener("click", () => stepSelection(1));
    slider.addEventListener("input", () => {
      selected = Number(slider.value);
      updateSelection();
    });
    open.addEventListener("click", openDecade);
    back.addEventListener("click", () => {
      selected = decade;
      decade = null;
      draw();
    });
    function locate(event) {
      const x = event.clientX - svg.getBoundingClientRect().left - geometry.left;
      if (x < 0 || x > geometry.plotWidth) return false;
      selected = rows[Math.min(rows.length - 1, Math.floor(x / geometry.step))].year;
      updateSelection();
      return true;
    }
    svg.addEventListener("pointermove", (event) => {
      if (event.pointerType === "mouse") locate(event);
    });
    svg.addEventListener("click", (event) => {
      if (locate(event)) openDecade();
    });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(draw) : null;
    observer?.observe(svg);
    draw();
    return { root, destroy() {
      disposed = true;
      observer?.disconnect();
    } };
  }

  // src/app.js
  var COMPONENT_ID = "bgm-collection-years";
  function element(tag, attributes = {}, children = []) {
    const node2 = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "class") node2.className = value;
      else if (key === "text") node2.textContent = value;
      else if (key.startsWith("aria-")) node2.setAttribute(key, value);
      else node2[key] = value;
    }
    node2.append(...children);
    return node2;
  }
  function mountRoot(root, route) {
    const sidebar = document.querySelector(route.kind === "profile" ? "#columnB" : "#columnSubjectBrowserB, #columnB");
    if (!sidebar) return false;
    const heatmap = sidebar.querySelector("#wiki-heatmap-stats-wrapper");
    if (heatmap) heatmap.after(root);
    else sidebar.prepend(root);
    const mobile = window.matchMedia?.("(max-width: 640px)");
    const place = () => {
      const main = document.querySelector(route.kind === "profile" ? "#user_home" : "#columnSubjectBrowserA, #columnA");
      if (mobile?.matches && main) main.prepend(root);
      else if (heatmap?.isConnected) heatmap.after(root);
      else sidebar.prepend(root);
    };
    place();
    mobile?.addEventListener("change", place);
    const observer = new MutationObserver(() => {
      if (mobile?.matches) return;
      const map = sidebar.querySelector("#wiki-heatmap-stats-wrapper");
      if (map && map.nextElementSibling !== root) map.after(root);
    });
    observer.observe(sidebar, { childList: true });
    return true;
  }
  function select(label, options, value) {
    const node2 = element("select", { "aria-label": label });
    node2.append(...options.map(([key, text]) => element("option", { value: key, text })));
    node2.value = value;
    return node2;
  }
  function renderChart(body, items, mode) {
    const data = distribution(items);
    const summary = element("p", { class: "bgmcy-summary" }, [
      element("strong", { text: String(data.total) }),
      document.createTextNode(" \u90E8\u4F5C\u54C1")
    ]);
    const chart = element("div", { class: "bgmcy-chart", role: "list", "aria-label": "\u5E74\u4EFD\u5206\u5E03" });
    const max = Math.max(1, ...data.rows.map((row) => row.count));
    for (const row of data.rows) {
      const fill = element("span", { class: "bgmcy-fill" });
      fill.style.width = `${row.count / max * 100}%`;
      const percent = `${Number(row.percent.toFixed(1))}%`;
      chart.append(element("div", { class: "bgmcy-row", role: "listitem", "aria-label": `${row.year}\u5E74\uFF0C${row.count}\u90E8\uFF0C\u5360${percent}` }, [
        element("time", { text: String(row.year), dateTime: String(row.year) }),
        element("div", { class: "bgmcy-bar", "aria-hidden": "true" }, [fill]),
        element("span", { class: "bgmcy-count", text: String(row.count) }),
        element("span", { class: "bgmcy-percent", text: percent })
      ]));
    }
    const histogram = mode !== "list" && data.rows.length ? createHistogram(data, mode) : null;
    const children = [summary, ...histogram ? [histogram.root] : mode === "list" ? [chart] : []];
    if (!data.total) children.push(element("p", { class: "bgmcy-empty", text: "\u6682\u65E0\u6536\u85CF" }));
    if (data.unknown.length) {
      const details = element("details", { class: "bgmcy-unknown" }, [
        element("summary", { text: `\u5E74\u4EFD\u5F85\u786E\u8BA4 \xB7 ${data.unknown.length} \u90E8` })
      ]);
      const list = element("ul");
      for (const item of data.unknown) list.append(element("li", {}, [
        element("a", { href: `/subject/${item.subjectId}`, text: item.title || `#${item.subjectId}` }),
        document.createTextNode(item.dateState === "pending" ? " \xB7 \u5F85\u5B9A" : " \xB7 \u65E5\u671F\u5F85\u8865\u5145")
      ]));
      details.append(list);
      children.push(details);
    }
    body.replaceChildren(...children);
    return () => histogram?.destroy();
  }
  function run() {
    if (document.getElementById(COMPONENT_ID) || window !== window.top) return;
    const route = parseRoute(location.pathname);
    if (!route) return;
    const viewer = getSignedInUsername(document);
    let storage;
    try {
      storage = window.localStorage;
    } catch {
    }
    const cache = createCache(storage, viewer, route.username);
    let mode = readChartMode(storage);
    let media = route.media || "anime";
    let status = route.status || "all";
    const root = element("section", { id: COMPONENT_ID, class: "bgmcy-card" });
    const refresh = element("button", { type: "button", class: "bgmcy-refresh", text: "\u5237\u65B0", "aria-label": "\u5237\u65B0\u6536\u85CF\u7EDF\u8BA1" });
    const heading = element("div", { class: "bgmcy-heading" }, [element("h2", { text: "\u6536\u85CF\u4F5C\u54C1\u5E74\u4EE3" }), refresh]);
    const filters = element("div", { class: "bgmcy-filters" });
    const mediaSelect = select("\u6536\u85CF\u7C7B\u522B", Object.entries(MEDIA).map(([key, value]) => [key, value.label]), media);
    const statusSelect = select("\u6536\u85CF\u72B6\u6001", [], status);
    const updateStatusOptions = () => {
      const labels = STATUS_LABELS[media];
      statusSelect.replaceChildren(...[["all", "\u6982\u89C8"], ...STATUS_ORDER.map((key) => [key, labels[key]])].map(([value, text]) => element("option", { value, text })));
      statusSelect.value = status;
    };
    updateStatusOptions();
    if (route.kind === "profile") filters.append(mediaSelect);
    else filters.append(element("span", { class: "bgmcy-media", text: MEDIA[media].label }));
    filters.append(statusSelect);
    const modeSelect = select("\u56FE\u8868\u7C7B\u578B", CHART_MODES, mode);
    const displayOptions = element("div", { class: "bgmcy-display-options" }, [modeSelect]);
    const body = element("div", { class: "bgmcy-body" });
    const message = element("p", { class: "bgmcy-status", "aria-live": "polite", hidden: true });
    root.append(heading, filters, displayOptions, body, message);
    if (!mountRoot(root, route)) return;
    function checkCurrentPage() {
      const affected = /* @__PURE__ */ new Set();
      for (const link of document.querySelectorAll('a[href*="/list/"]')) {
        const linked = parseRoute(new URL(link.href, location.origin).pathname);
        if (!linked?.status || linked.username !== route.username) continue;
        const count = link.textContent.match(/(?:\(|\s)(\d+)\)?\s*$/)?.[1];
        const saved = cache.read(linked.media, linked.status);
        if (saved && count !== void 0 && Number(count) !== saved.items.length) affected.add(linked.media);
      }
      if (route.kind === "list" && route.status) {
        const saved = cache.read(route.media, route.status);
        const current = parseCollectionDocument(document, route.media, route.status);
        if (saved && current.some((item) => !saved.items.some((old) => old.subjectId === item.subjectId && old.private === item.private && (!item.year || old.year === item.year)))) affected.add(route.media);
      }
      for (const key of affected) cache.invalidate(key);
      return affected.size > 0;
    }
    checkCurrentPage();
    let generation = 0;
    let controller;
    let alive = true;
    let visibleItems = null;
    let destroyChart = () => {
    };
    function display(items) {
      visibleItems = items;
      destroyChart();
      destroyChart = renderChart(body, items, mode);
    }
    modeSelect.addEventListener("change", () => {
      mode = modeSelect.value;
      saveChartMode(storage, mode);
      if (visibleItems !== null) display(visibleItems);
    });
    function showMessage(text) {
      message.textContent = text;
      message.hidden = !text;
    }
    async function load(force = false) {
      const current = ++generation;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const tasks = tasksForSelection(media, status);
      const saved = tasks.map((task) => cache.read(task.media, task.status));
      const hasAll = saved.every(Boolean);
      if (hasAll) display(saved.flatMap((data) => data.items));
      else {
        visibleItems = null;
        destroyChart();
        body.replaceChildren();
      }
      if (!force && hasAll && saved.every((data) => data.fresh)) {
        refresh.disabled = false;
        showMessage("");
        return;
      }
      refresh.disabled = true;
      showMessage(hasAll ? "\u66F4\u65B0\u4E2D\u2026" : "\u52A0\u8F7D\u4E2D\u2026");
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
        showMessage("");
      } catch (error) {
        if (current !== generation || !alive) return;
        controller.abort();
        showMessage(hasAll ? "\u66F4\u65B0\u5931\u8D25\uFF0C\u663E\u793A\u4E0A\u6B21\u7ED3\u679C\u3002\u8BF7\u70B9\u51FB\u5237\u65B0\u91CD\u8BD5\u3002" : error.message || "\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u70B9\u51FB\u5237\u65B0\u91CD\u8BD5\u3002");
      } finally {
        if (current === generation) refresh.disabled = false;
      }
    }
    mediaSelect.addEventListener("change", () => {
      media = mediaSelect.value;
      status = "all";
      updateStatusOptions();
      load();
    });
    statusSelect.addEventListener("change", () => {
      status = statusSelect.value;
      load();
    });
    refresh.addEventListener("click", () => load(true));
    const list = document.querySelector("#browserItemList");
    let timer;
    if (list) {
      const fingerprint = () => Array.from(list.children).map((item) => [item.id, item.querySelector("p.info")?.textContent, item.querySelector(".collectInfo")?.textContent]);
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
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        checkCurrentPage();
        load();
      }
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        alive = true;
        checkCurrentPage();
        load();
      }
    });
    window.addEventListener("pagehide", () => {
      alive = false;
      controller?.abort();
      clearTimeout(timer);
    });
    load();
  }
  run();
})();
