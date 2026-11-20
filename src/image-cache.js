// A viewer-local cache. Only adjacent photos are retained, never entire albums or videos.
export const IMAGE_CACHE_PIXELS = 24_000_000;
export function createImageCache({ maxEntries = 3, maxPixels = IMAGE_CACHE_PIXELS, timeout = 8000, createImage = () => typeof Image === 'undefined' ? null : new Image() } = {}) {
  const entries = new Map();
  let disposed = false;
  let activeKey = null;

  function release(key) {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    entry.cancel();
  }
  function trim(protectedKey) {
    let pixels = [...entries.values()].reduce((sum, entry) => sum + entry.pixels, 0);
    for (const [key, entry] of entries) {
      if (entries.size <= maxEntries && pixels <= maxPixels) break;
      if (key === protectedKey) continue;
      pixels -= entry.pixels;
      release(key);
    }
  }
  function get(item) { return entries.get(item?.url)?.ready || null; }
  function prepare(item, { background = false } = {}) {
    if (disposed || item?.kind !== 'image' || !item.url) return Promise.resolve(null);
    if (!background) activeKey = item.url;
    const existing = entries.get(item.url);
    if (existing) {
      entries.delete(item.url); entries.set(item.url, existing);
      return existing.promise;
    }
    const estimatedPixels = item.width * item.height || 4_000_000;
    if (background && (entries.size >= maxEntries || estimatedPixels + [...entries.values()].reduce((sum, entry) => sum + entry.pixels, 0) > maxPixels)) return Promise.resolve(null);
    const image = createImage();
    if (!image) return Promise.resolve(null);
    let settle;
    let settled = false;
    let decoding = false;
    let timer;
    const promise = new Promise(resolve => { settle = resolve; });
    const entry = { promise, ready: null, pixels: estimatedPixels, cancel: () => finish(null, true) };
    function finish(value, cancel = false) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null; image.onerror = null;
      if (cancel) image.src = '';
      entry.ready = value;
      if (!value && entries.get(item.url) === entry) entries.delete(item.url);
      if (value) { entry.pixels = value.naturalWidth * value.naturalHeight; trim(activeKey); }
      settle(value);
    }
    async function loaded() {
      if (settled || decoding) return;
      decoding = true;
      try {
        if (typeof image.decode === 'function') await image.decode();
        if (image.naturalWidth > 0 && image.naturalHeight > 0) finish(image);
        else finish(null);
      } catch { finish(null); }
    }
    entries.set(item.url, entry);
    image.decoding = 'async';
    image.onload = loaded;
    image.onerror = () => finish(null);
    timer = setTimeout(() => finish(null, true), timeout);
    image.src = item.url;
    if (image.complete && image.naturalWidth) loaded();
    trim(activeKey);
    return promise;
  }
  function retain(items) {
    const keep = new Set(items.filter(item => item?.kind === 'image').map(item => item.url));
    for (const key of entries.keys()) if (!keep.has(key)) release(key);
  }
  return {
    get, prepare, retain,
    get size() { return entries.size; },
    dispose() { disposed = true; for (const key of [...entries.keys()]) release(key); },
  };
}
