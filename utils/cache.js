let redisClient = null;
let useRedis = false;
if (process.env.REDIS_URL) {
  try {
    const IORedis = require('ioredis');
    redisClient = new IORedis(process.env.REDIS_URL);
    redisClient.on('error', (e) => console.warn('cache: Redis error', e && e.message ? e.message : e));
    useRedis = true;
    console.info('cache: using Redis at', process.env.REDIS_URL);
  } catch (e) {
    console.warn('cache: ioredis not available, falling back to in-memory cache');
    useRedis = false;
    redisClient = null;
  }
}

const memoryCache = new Map();

function _now() { return Date.now(); }

async function set(key, value, ttlMs = 30000) {
  if (useRedis && redisClient) {
    try {
      const payload = JSON.stringify(value);
      await redisClient.set(key, payload, 'PX', ttlMs);
      return true;
    } catch (e) {
      console.warn('cache.set: redis set failed, falling back to memory', e && e.message ? e.message : e);
    }
  }
  const expiresAt = _now() + ttlMs;
  memoryCache.set(key, { value, expiresAt });
  return true;
}

async function get(key) {
  if (useRedis && redisClient) {
    try {
      const raw = await redisClient.get(key);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return raw; }
    } catch (e) {
      console.warn('cache.get: redis get failed, falling back to memory', e && e.message ? e.message : e);
    }
  }
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (_now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

async function del(key) {
  if (useRedis && redisClient) {
    try { await redisClient.del(key); return true; } catch (e) { }
  }
  memoryCache.delete(key);
  return true;
}

async function clear() {
  if (useRedis && redisClient) {
    try { await redisClient.flushdb(); return true; } catch (e) { }
  }
  memoryCache.clear();
  return true;
}

module.exports = { set, get, del, clear };
