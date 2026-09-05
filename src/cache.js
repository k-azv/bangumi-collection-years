export const CACHE_TTL = 6 * 60 * 60 * 1000;
const PREFIX = 'bgmcy:v2:';

// Cache failures should never stop the chart from loading.
export function createCache(storage, viewer, username, now = Date.now) {
  const scope = `${PREFIX}${encodeURIComponent(viewer || 'guest')}:${encodeURIComponent(username)}:`;
  const key = (media, status) => `${scope}${media}:${status}`;
  function read(media, status) {
    try {
      const data = JSON.parse(storage.getItem(key(media, status)));
      if (!data || !Number.isFinite(data.at) || !Array.isArray(data.items) || !data.items.every(item =>
        item.media === media && item.status === status && /^\d+$/.test(item.subjectId) &&
        (item.year === null || Number.isInteger(item.year)))) return null;
      return { ...data, fresh: now() >= data.at && now() - data.at < CACHE_TTL };
    } catch { return null; }
  }
  function write(media, status, items) {
    try { storage.setItem(key(media, status), JSON.stringify({ at: now(), items })); } catch { /* memory-only fallback */ }
  }
  function invalidate(media) {
    try {
      for (let i = storage.length - 1; i >= 0; i--) {
        const name = storage.key(i);
        if (name?.startsWith(`${scope}${media}:`)) storage.removeItem(name);
      }
    } catch { /* storage can be disabled */ }
  }
  return { read, write, invalidate };
}
