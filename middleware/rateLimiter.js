
const buckets = new Map();

function now() { return Date.now(); }

function getConfig() {
  const tokens = parseInt(process.env.RATE_LIMIT_TOKENS || '20', 10);
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  return { tokens: isNaN(tokens) ? 20 : tokens, windowMs: isNaN(windowMs) ? 60000 : windowMs };
}

function getBucket(key, initialTokens) {
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: initialTokens, last: now() };
    buckets.set(key, b);
  }
  return b;
}

let redisClient = null;
let useRedis = false;
if (process.env.REDIS_URL) {
  try {
    const IORedis = require('ioredis');
    redisClient = new IORedis(process.env.REDIS_URL);
    redisClient.on('error', (e) => console.warn('Redis client error for rateLimiter:', e && e.message ? e.message : e));
    useRedis = true;
    console.info('Rate limiter: using Redis at', process.env.REDIS_URL);
  } catch (e) {
    console.warn('ioredis not available or failed to initialize, falling back to in-memory limiter');
    useRedis = false;
    redisClient = null;
  }
}

module.exports = async function rateLimiter(req, res, next) {
  try {
    const { tokens: DEFAULT_TOKENS, windowMs: WINDOW_MS } = getConfig();
    const ip = (req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || 'unknown').toString().split(',')[0].trim();

    if (useRedis && redisClient) {
      try {
        const key = `rate:${ip}`;
        const current = await redisClient.incr(key);
        if (current === 1) {
          await redisClient.pexpire(key, WINDOW_MS);
        }
        if (current > DEFAULT_TOKENS) {
          return res.status(429).json({ success: false, message: 'Too many requests' });
        }
        return next();
      } catch (redisErr) {
        console.warn('Redis rateLimiter error, falling back to in-memory:', redisErr && redisErr.message ? redisErr.message : redisErr);
      }
    }

    const bucket = getBucket(ip, DEFAULT_TOKENS);
    const elapsed = Math.max(0, now() - bucket.last);
    const refill = (elapsed / WINDOW_MS) * DEFAULT_TOKENS;
    bucket.tokens = Math.min(DEFAULT_TOKENS, bucket.tokens + refill);
    bucket.last = now();

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return next();
    }
    res.status(429).json({ success: false, message: 'Too many requests' });
  } catch (e) {
    console.warn('Rate limiter failure', e && e.message ? e.message : e);
    next();
  }
};
