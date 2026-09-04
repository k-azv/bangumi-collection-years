// ==UserScript==
// @name         Bangumi 收藏作品年代
// @namespace    https://github.com/k-azv/bangumi-collection-years
// @version      0.1.0
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
  function aggregateCollections(items) {
    const years = /* @__PURE__ */ new Map();
    const seen = /* @__PURE__ */ new Set();
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
      if (!years.has(item.year)) years.set(item.year, Object.fromEntries(STATUS_ORDER.map((status) => [status, 0])));
      years.get(item.year)[item.status] += 1;
    }
    return {
      total: seen.size,
      dated: seen.size - unknown,
      unknown,
      privateCount,
      years: [...years.entries()].sort(([a], [b]) => b - a).map(([year, statuses]) => ({ year, statuses }))
    };
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
      const pageItems = parseCollectionDocument(doc, media, status);
      items.push(...pageItems);
      onPage?.({ url, count: pageItems.length, total: items.length });
      url = getNextPageUrl(doc, url);
    }
    return items;
  }
  function mediaForRoute(route) {
    return route.kind === "list" ? [route.media] : Object.keys(MEDIA);
  }

  // src/app.js
  var COMPONENT_ID = "bgm-collection-years";
  var STATUS_COLORS = Object.freeze({
    wish: "#72a7c9",
    collect: "#f09199",
    do: "#80b978",
    on_hold: "#c9a65d",
    dropped: "#9a9a9a"
  });
  function element(tag, attributes = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("aria-")) node.setAttribute(key, value);
      else node[key] = value;
    }
    for (const child of children) node.append(child);
    return node;
  }
  function getMount(route) {
    if (route.kind === "profile") {
      const home = document.querySelector("#user_home");
      return home ? { parent: home, before: home.querySelector(".section.sort") } : null;
    }
    const column = document.querySelector("#columnSubjectBrowserA");
    const list = column?.querySelector("#browserItemList");
    return column && list ? { parent: column, before: list } : null;
  }
  function statusLabel(media, status, combined) {
    if (combined) return { wish: "\u60F3\u6536\u85CF", collect: "\u5DF2\u5B8C\u6210", do: "\u8FDB\u884C\u4E2D", on_hold: "\u6401\u7F6E", dropped: "\u629B\u5F03" }[status];
    return STATUS_LABELS[media][status];
  }
  function formatProgress(state) {
    if (state.phase === "waiting") return "\u8BFB\u53D6\u5404\u6536\u85CF\u9875\u7684\u4F5C\u54C1\u8D44\u6599\uFF0C\u7EDF\u8BA1\u53EA\u5728\u672C\u9875\u5185\u5B58\u4E2D\u5904\u7406\u3002";
    if (state.phase === "loading") return `\u6B63\u5728\u8BFB\u53D6 ${state.finished}/${state.total} \u4E2A\u6536\u85CF\u5206\u7C7B \xB7 ${state.pages} \u9875`;
    if (state.phase === "error") return state.error;
    return "";
  }
  function createShell(route, ownProfile) {
    const root = element("section", { id: COMPONENT_ID, class: "bgmcy-card" });
    const title = route.kind === "profile" ? "\u6536\u85CF\u4F5C\u54C1\u5E74\u4EE3" : `${MEDIA[route.media].label}\u4F5C\u54C1\u5E74\u4EE3`;
    const subtitle = ownProfile ? "\u6309\u4F5C\u54C1\u53D1\u884C\u5E74\u4EFD\u7EDF\u8BA1\uFF0C\u5305\u542B\u81EA\u5DF1\u53EF\u89C1\u7684\u6536\u85CF" : "\u6309\u4F5C\u54C1\u53D1\u884C\u5E74\u4EFD\u4E0E\u5F53\u524D\u8D26\u53F7\u53EF\u89C1\u8303\u56F4\u7EDF\u8BA1";
    const heading = element("div", { class: "bgmcy-heading" }, [
      element("h2", { text: title }),
      element("span", { class: "bgmcy-subtitle", text: subtitle })
    ]);
    const body = element("div", { class: "bgmcy-body" });
    const status = element("p", { class: "bgmcy-status", text: formatProgress({ phase: "waiting" }), "aria-live": "polite" });
    const loadButton = element("button", { type: "button", class: "chiiBtn bgmcy-load" }, [element("span", { text: "\u52A0\u8F7D\u6536\u85CF\u7EDF\u8BA1" })]);
    root.append(heading, body, element("div", { class: "bgmcy-actions" }, [status, loadButton]));
    return { root, body, status, loadButton };
  }
  function createTabs(mediaKeys, active, onSelect) {
    if (mediaKeys.length < 2) return null;
    const tabs = element("div", { class: "bgmcy-tabs", role: "tablist", "aria-label": "\u6536\u85CF\u7C7B\u522B" });
    const choices = [["all", "\u5168\u90E8"], ...mediaKeys.map((key) => [key, MEDIA[key].label])];
    for (const [key, label] of choices) {
      const button = element("button", {
        type: "button",
        class: `bgmcy-tab${key === active ? " is-active" : ""}`,
        text: label,
        role: "tab",
        "aria-selected": String(key === active)
      });
      button.addEventListener("click", () => onSelect(key));
      tabs.append(button);
    }
    return tabs;
  }
  function renderChart(container, items, mediaKey) {
    container.replaceChildren();
    const combined = mediaKey === "all";
    const selected = new Set(STATUS_ORDER);
    function draw() {
      const filtered = combined ? items : items.filter((item) => item.media === mediaKey);
      const data = aggregateCollections(filtered);
      const visibleTotal = data.years.reduce((sum, row) => sum + STATUS_ORDER.reduce((n, status) => n + (selected.has(status) ? row.statuses[status] : 0), 0), 0);
      const max = Math.max(1, ...data.years.map((row) => STATUS_ORDER.reduce((n, status) => n + (selected.has(status) ? row.statuses[status] : 0), 0)));
      const chart = element("div", { class: "bgmcy-chart" });
      const summary = element("div", { class: "bgmcy-summary" }, [
        element("strong", { text: String(visibleTotal) }),
        element("span", { text: ` \u90E8\u6709\u53D1\u884C\u5E74\u4EFD \xB7 \u5171 ${data.total} \u90E8` })
      ]);
      const legend = element("div", { class: "bgmcy-legend", "aria-label": "\u7B5B\u9009\u6536\u85CF\u72B6\u6001" });
      for (const status of STATUS_ORDER) {
        const count = filtered.filter((item) => item.status === status).length;
        const button = element("button", {
          type: "button",
          class: `bgmcy-legend-item${selected.has(status) ? " is-active" : ""}`,
          "aria-pressed": String(selected.has(status))
        }, [
          element("i", { class: "bgmcy-dot" }),
          element("span", { text: `${statusLabel(combined ? "anime" : mediaKey, status, combined)} ${count}` })
        ]);
        button.style.setProperty("--bgmcy-color", STATUS_COLORS[status]);
        button.addEventListener("click", () => {
          if (selected.has(status) && selected.size > 1) selected.delete(status);
          else selected.add(status);
          draw();
        });
        legend.append(button);
      }
      for (const row of data.years) {
        const rowTotal = STATUS_ORDER.reduce((sum, status) => sum + (selected.has(status) ? row.statuses[status] : 0), 0);
        if (!rowTotal) continue;
        const bar = element("div", { class: "bgmcy-bar", title: `${row.year} \xB7 ${rowTotal} \u6761` });
        for (const status of STATUS_ORDER) {
          const count = selected.has(status) ? row.statuses[status] : 0;
          if (!count) continue;
          const segment = element("span", { class: "bgmcy-segment" });
          segment.style.width = `${count / max * 100}%`;
          segment.style.backgroundColor = STATUS_COLORS[status];
          segment.title = `${statusLabel(combined ? "anime" : mediaKey, status, combined)} ${count}`;
          bar.append(segment);
        }
        chart.append(element("div", { class: "bgmcy-row" }, [
          element("time", { text: String(row.year), dateTime: String(row.year) }),
          bar,
          element("span", { class: "bgmcy-count", text: String(rowTotal) })
        ]));
      }
      if (!data.years.length) chart.append(element("p", { class: "bgmcy-empty", text: "\u8FD9\u4E9B\u4F5C\u54C1\u8FD8\u6CA1\u6709\u53EF\u7EDF\u8BA1\u7684\u53D1\u884C\u5E74\u4EFD\u3002" }));
      if (data.unknown) chart.append(element("p", { class: "bgmcy-note", text: `${data.unknown} \u90E8\u4F5C\u54C1\u7684\u7AD9\u70B9\u8D44\u6599\u7F3A\u5C11\u53D1\u884C\u5E74\u4EFD\uFF0C\u5F52\u5165\u5E74\u4EFD\u672A\u77E5\u3002` }));
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
    ui.loadButton.addEventListener("click", async () => {
      ui.loadButton.disabled = true;
      ui.loadButton.querySelector("span").textContent = "\u8BFB\u53D6\u4E2D";
      const mediaKeys = mediaForRoute(route);
      const tasks = mediaKeys.flatMap((media) => STATUS_ORDER.map((status) => ({ media, status })));
      const state = { phase: "loading", finished: 0, total: tasks.length, pages: 0 };
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
              }
            });
            state.finished += 1;
            ui.status.textContent = formatProgress(state);
          }
        }
        await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, worker));
        const items = results.flat();
        let active = route.kind === "list" ? route.media : "all";
        const content = element("div");
        const rerender = (key) => {
          active = key;
          ui.body.querySelectorAll(".bgmcy-tab").forEach((tab, index) => {
            const tabKey = index === 0 ? "all" : mediaKeys[index - 1];
            tab.classList.toggle("is-active", tabKey === active);
            tab.setAttribute("aria-selected", String(tabKey === active));
          });
          renderChart(content, items, active);
        };
        const tabs = createTabs(mediaKeys, active, rerender);
        ui.body.replaceChildren(...tabs ? [tabs] : [], content);
        renderChart(content, items, active);
        ui.status.textContent = ownProfile ? "\u7EDF\u8BA1\u5B8C\u6210 \xB7 \u81EA\u5DF1\u53EF\u89C1\u8BB0\u5F55\u5DF2\u6309\u767B\u5F55\u6743\u9650\u8BA1\u5165" : "\u7EDF\u8BA1\u5B8C\u6210 \xB7 \u7ED3\u679C\u6309\u5F53\u524D\u8D26\u53F7\u53EF\u89C1\u8303\u56F4\u751F\u6210";
        ui.loadButton.remove();
      } catch (error) {
        state.phase = "error";
        state.error = error instanceof Error ? error.message : "\u8BFB\u53D6\u6536\u85CF\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
        ui.status.textContent = formatProgress(state);
        ui.loadButton.disabled = false;
        ui.loadButton.querySelector("span").textContent = "\u91CD\u65B0\u52A0\u8F7D";
      }
    });
  }
  run();
})();
