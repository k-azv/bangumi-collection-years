export const CACHE_TTL = 6 * 60 * 60 * 1000;
const PREFIX = 'bgmcy:v2:';

// Cache failures should never stop the chart from loading.
export function createCache(storage, viewer, username, now = Date.now) {
  const scope = `${PREFIX}${encodeURIComponent(viewer || 'guest')}:${encodeURIComponent(username)}:`;
  const memory = new Map();
  const key = (media, status) => `${scope}${media}:${status}`;
  const parsed = new Map();
  function read(media, status) {
    const name = key(media, status);
    let raw;
    try { raw = storage?.getItem(name); } catch { /* memory fallback */ }
    const ram = memory.get(name);
    let disk = null;
    if (raw) {
      const previous = parsed.get(name);
      if (previous?.raw === raw) disk = previous.data;
      else {
        try {
          const data = JSON.parse(raw);
          if (data && Number.isFinite(data.at) && Array.isArray(data.items) && data.items.every(item =>
            item.media === media && item.status === status && /^\d+$/.test(item.subjectId) &&
            (item.year === null || Number.isInteger(item.year)))) disk = data;
        } catch { /* malformed persistent entry */ }
        parsed.set(name, { raw, data: disk });
      }
    } else parsed.delete(name);
    const data = ram && (!disk || ram.at >= disk.at) ? ram : disk;
    return data ? { ...data, fresh: now() >= data.at && now() - data.at < CACHE_TTL } : null;
  }
  function write(media, status, items, pageCount) {
    const old = read(media, status);
    // Compare only on writes; unchanged responses retain their data identity.
    if (old && JSON.stringify(old.items) === JSON.stringify(items)) items = old.items;
    const data = { at: now(), items, pageCount };
    memory.set(key(media, status), data);
    try {
      const raw = JSON.stringify(data);
      // Budget in UTF-16 code units; the newest result still lives in memory if too large.
      const budget = 2_000_000;
      if (raw.length > budget) return items;
      const entries = [];
      for (let i = storage.length - 1; i >= 0; i--) {
        const name = storage.key(i);
        if (!name?.startsWith(PREFIX) || name === key(media, status)) continue;
        const stored = storage.getItem(name) || '';
        // Our serialized entries begin with at; inspect the header, not every collection item.
        const at = Number(stored.slice(0, 80).match(/^\s*\{\s*"at"\s*:\s*(\d+(?:\.\d+)?)/)?.[1]);
        if (!Number.isFinite(at) || now() - at > 7 * 24 * 60 * 60 * 1000) storage.removeItem(name);
        else entries.push({ name, at, size: stored.length });
      }
      entries.sort((a, b) => b.at - a.at);
      let size = raw.length;
      entries.forEach((entry, index) => {
        if (index >= 49 || size + entry.size > budget) storage.removeItem(entry.name);
        else size += entry.size;
      });
      storage.setItem(key(media, status), raw);
      parsed.set(key(media, status), { raw, data });
      memory.delete(key(media, status));
    } catch { /* memory fallback */ }
    return items;
  }
  function invalidate(media, status) {
    const matches = name => status ? name === key(media, status) : name.startsWith(`${scope}${media}:`);
    for (const map of [memory, parsed]) for (const name of map.keys()) if (matches(name)) map.delete(name);
    try {
      for (let i = storage.length - 1; i >= 0; i--) {
        const name = storage.key(i);
        if (name && matches(name)) storage.removeItem(name);
      }
    } catch { /* storage can be disabled */ }
  }
  return { read, write, invalidate };
}
