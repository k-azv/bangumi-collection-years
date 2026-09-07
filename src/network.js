// Request coordination is shared by tabs on the same origin when Web Locks is available.
const PREFIX = 'bgmcy:network:';
const INTERVAL = 250;
export function createNetwork({ storage, locks, fetchImpl = fetch, now = Date.now, random = Math.random } = {}) {
  const memory = new Map();
  const pending = new Set();
  let slot = 0;
  const tails = new Map();
  function read(key) {
    if (pending.has(key)) return memory.get(key);
    try { const value = JSON.parse(storage?.getItem(PREFIX + key) || 'null'); if (value) return value; } catch { /* local fallback */ }
    return memory.get(key);
  }
  function write(key, value) {
    memory.set(key, value);
    try { storage?.setItem(PREFIX + key, JSON.stringify(value)); pending.delete(key); } catch { pending.add(key); }
  }
  function lock(name, signal, work) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (locks) return locks.request(PREFIX + name, { signal }, work);
    const previous = tails.get(name) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => { if (signal?.aborted) throw signal.reason; return work(); });
    tails.set(name, next);
    next.finally(() => { if (tails.get(name) === next) tails.delete(name); }).catch(() => {});
    return next;
  }
  function pause(ms, signal) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
  function checkCooldown() {
    const state = read('cooldown');
    if (state?.until > now()) {
      const error = new Error(`请求暂缓（${state.reason}），请在 ${new Date(state.until).toLocaleTimeString()} 后重试`);
      error.retryAt = state.until;
      throw error;
    }
  }
  function coolDown(reason, retryAfter) {
    const old = read('cooldown');
    const failures = Math.min(6, (old?.failures || 0) + 1);
    const seconds = Number(retryAfter);
    const serverUntil = retryAfter ? (Number.isFinite(seconds) ? now() + seconds * 1000 : Date.parse(retryAfter)) : 0;
    const until = Math.max(old?.until || 0, serverUntil || 0, now() + Math.min(900000, 30000 * 2 ** (failures - 1)) + random() * 10000);
    write('cooldown', { until, failures, reason });
    checkCooldown();
  }
  const request = (url, options = {}) => lock(`slot:${slot++ % 4}`, options.signal, async () => {
    checkCooldown();
    // Separate start gate bounds bursts even when responses are very fast.
    await lock('start', options.signal, async () => {
      checkCooldown();
      await pause(Math.min(INTERVAL, Math.max(0, (read('start') || 0) + INTERVAL - now())), options.signal);
      checkCooldown();
      write('start', now());
    });
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal.reason);
    if (options.signal?.aborted) throw options.signal.reason;
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('请求超时')), 15000);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      if ([401, 403, 429].includes(response.status) || response.status >= 500) {
        await response.body?.cancel().catch(() => {});
        coolDown(`HTTP ${response.status}`, response.headers?.get('Retry-After'));
      }
      const text = await response.text();
      if (read('cooldown')?.until <= now()) write('cooldown', { until: 0, failures: 0 });
      return { ok: response.ok, status: response.status, text: async () => text };
    } catch (error) {
      if (options.signal?.aborted || error.retryAt) throw error;
      coolDown(controller.signal.aborted ? '请求超时' : '网络异常');
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  });
  function failed(error) {
    if (error.retryAt) return error;
    try { coolDown(error.message || '读取失败'); } catch (paused) { return paused; }
  }
  return { request, lock, checkCooldown, failed };
}
