const apiCache = new Map();
const CACHE_TTL = 5000;

export function getCached(key) {
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

export function setCache(key, data) {
  apiCache.set(key, {
    data,
    timestamp: Date.now(),
  });

  if (apiCache.size > 100) {
    const firstKey = apiCache.keys().next().value;
    apiCache.delete(firstKey);
  }
}
