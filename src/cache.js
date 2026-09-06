export const CACHE_TTL = 6 * 60 * 60 * 1000;
const PREFIX = 'bgmcy:v2:';

// Cache failures should never stop the chart from loading.
export function createCache(storage, viewer, username, now = Date.now) {
  const scope = `${PREFIX}${encodeURIComponent(viewer || 'guest')}:${encodeURIComponent(username)}:`;
  const memory = new Map();
  const key = (media, status) => `${scope}${media}:${status}`;
  function read(media, status) {
    try {
      const name = key(media, status);
      let raw;
      try { raw = storage?.getItem(name); } catch { /* memory fallback */ }
      const disk = raw ? JSON.parse(raw) : null;
      const ram = memory.get(name);
      const data = ram && (!disk || ram.at >= disk.at) ? ram : disk;
      if (!data || !Number.isFinite(data.at) || !Array.isArray(data.items) || !data.items.every(item =>
        item.media === media && item.status === status && /^\d+$/.test(item.subjectId) &&
        (item.year === null || Number.isInteger(item.year)))) return null;
      return { ...data, fresh: now() >= data.at && now() - data.at < CACHE_TTL };
    } catch { return null; }
  }
  function write(media, status, items) {
    const data = { at: now(), items };
    memory.set(key(media, status), data);
    try {
      const entries = [];
      for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i);
        if (!name?.startsWith(PREFIX)) continue;
        try { entries.push({ name, at: JSON.parse(storage.getItem(name)).at }); }
        catch { storage.removeItem(name); i--; }
      }
      entries.sort((a, b) => b.at - a.at);
      entries.forEach((entry, index) => {
        if (index >= 49 || now() - entry.at > 7 * 24 * 60 * 60 * 1000) storage.removeItem(entry.name);
      });
      storage.setItem(key(media, status), JSON.stringify(data));
    } catch { /* memory fallback */ }
  }
  function invalidate(media, status) {
    const matches = name => status ? name === key(media, status) : name.startsWith(`${scope}${media}:`);
    for (const name of memory.keys()) if (matches(name)) memory.delete(name);
    try {
      for (let i = storage.length - 1; i >= 0; i--) {
        const name = storage.key(i);
        if (name && matches(name)) storage.removeItem(name);
      }
    } catch { /* storage can be disabled */ }
  }
  return { read, write, invalidate };
}
