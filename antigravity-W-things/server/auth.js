const crypto = require('crypto');

const SESSION_SECRET = process.env.SESSION_SECRET || '';
const COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-rockstar_session' : 'rockstar_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function b64url(value) {
  return Buffer.from(value).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function unb64url(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

function signToken(payload) {
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters.');
  }
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  }));
  const signature = crypto.createHmac('sha256', SESSION_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || !SESSION_SECRET) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const expected = crypto.createHmac('sha256', SESSION_SECRET)
    .update(`${parts[0]}.${parts[1]}`)
    .digest('base64url');

  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(unb64url(parts[1]));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_MAX_AGE / 1000)}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  );
}

function requireAuth(req, res, next) {
  const token = parseCookies(req)[COOKIE_NAME];
  const session = verifyToken(token);
  if (!session) {
    return res.status(401).json({ error: { message: 'Please log in to continue.' } });
  }
  req.user = session;
  next();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

module.exports = {
  COOKIE_NAME,
  signToken,
  verifyToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  hashPassword,
  verifyPassword
};
