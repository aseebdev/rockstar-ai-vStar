/**
 * Defense-in-depth security middleware for Rockstar AI.
 * This is intentionally dependency-free so it remains easy to deploy.
 */

const crypto = require('crypto');

// In-memory rate limiter. This protects a single Node process; put a real edge/WAF
// or shared limiter in front of multi-instance deployments for distributed limits.
const buckets = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_BUCKETS = 20000;

function clientIp(req) {
  // Do not trust X-Forwarded-For unless TRUST_PROXY is explicitly enabled.
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || 'unknown';
}

function rateLimit({ windowMs = WINDOW_MS, max = 120, keyFn = clientIp, message = 'Too many requests. Try hard buddy — it’s built different. — Aseebdev' } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const key = String(keyFn(req));
    const bucketKey = `${max}:${windowMs}:${key}`;
    let entry = buckets.get(bucketKey);

    if (!entry || now - entry.startedAt >= windowMs) {
      entry = { startedAt: now, count: 0 };
      buckets.set(bucketKey, entry);
    }

    entry.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (buckets.size > MAX_BUCKETS) {
      for (const [k, v] of buckets) {
        if (now - v.startedAt >= windowMs) buckets.delete(k);
      }
    }

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.startedAt + windowMs - now) / 1000)));
      return res.status(429).json({
        error: {
          message,
          code: 'rate_limited',
          security: 'Try hard buddy — it’s built different. — Aseebdev'
        }
      });
    }
    next();
  };
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.removeHeader('X-Powered-By');

  // HSTS must only be sent when the site is actually HTTPS.
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Keep this compatible with the existing UI while blocking the dangerous classes
  // of browser resource loading that are not needed by Rockstar AI.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self';"
  );

  next();
}

// Browser state-changing requests must come from this application, not an unrelated site.
function sameOriginGuard(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const origin = req.get('Origin');
  if (!origin) return next(); // Non-browser clients have no Origin header.

  const allowed = new Set(
    String(process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(v => v.trim().replace(/\/$/, ''))
      .filter(Boolean)
  );

  const hostOrigin = `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
  if (origin === hostOrigin || allowed.has(origin)) return next();

  return res.status(403).json({
    error: { message: 'Cross-site request blocked by Rockstar AI security. Try hard buddy — it’s built different. — Aseebdev', code: 'origin_blocked' }
  });
}

function rateLimitAuth(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  // Hash the email so the limiter map never stores a raw address.
  const emailHash = crypto.createHash('sha256').update(email).digest('hex').slice(0, 24);
  return `${clientIp(req)}:${emailHash}`;
}

function validateChatPayload(req, res, next) {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: { message: 'Invalid request: "messages" must be a non-empty array.' } });
  }
  if (messages.length > 40) {
    return res.status(400).json({ error: { message: 'Too much conversation context. Maximum 40 messages per request.' } });
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg !== 'object' || !['system', 'user', 'assistant'].includes(msg.role)) {
      return res.status(400).json({ error: { message: `Invalid message at index ${i}.` } });
    }

    if (typeof msg.content === 'string') {
      if (msg.content.length > 120000) {
        return res.status(400).json({ error: { message: `Message ${i} exceeds the 120,000 character limit.` } });
      }
      continue;
    }

    if (!Array.isArray(msg.content) || msg.content.length > 20) {
      return res.status(400).json({ error: { message: `Invalid multimodal content at message ${i}.` } });
    }

    for (const part of msg.content) {
      if (!part || typeof part !== 'object') {
        return res.status(400).json({ error: { message: `Invalid content part at message ${i}.` } });
      }
      if (part.type === 'text') {
        if (typeof part.text !== 'string' || part.text.length > 120000) {
          return res.status(400).json({ error: { message: `Attached text in message ${i} is too large.` } });
        }
      } else if (part.type === 'image_url') {
        const url = part.image_url?.url;
        if (typeof url !== 'string' || !/^data:image\/(png|jpe?g|webp|gif|bmp|heic|heif);base64,/i.test(url)) {
          return res.status(400).json({ error: { message: 'Only browser-provided image attachments are supported.' } });
        }
        if (url.length > 10 * 1024 * 1024) {
          return res.status(413).json({ error: { message: 'An attached image is too large. Maximum image payload is 10 MB.' } });
        }
      } else {
        return res.status(400).json({ error: { message: `Unsupported content type "${part.type}".` } });
      }
    }
  }
  next();
}

module.exports = {
  securityHeaders,
  sameOriginGuard,
  rateLimit,
  rateLimitAuth,
  validateChatPayload
};
