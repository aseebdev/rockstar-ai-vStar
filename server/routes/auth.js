const express = require('express');
const router = express.Router();
const { getPool, newId } = require('../db');
const { encryptSecret, decryptSecret } = require('../key-vault');
const {
  signToken, setSessionCookie, clearSessionCookie,
  requireAuth, hashPassword, verifyPassword
} = require('../auth');
const { rateLimit, rateLimitAuth } = require('../middleware/security');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dbRequired(res) {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ error: { message: 'Database is not configured yet. Add DATABASE_URL to the server environment.' } });
    return null;
  }
  return pool;
}

router.post('/register',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'Too many account attempts. Try hard buddy — it’s built different. — Aseebdev' }),
  rateLimit({ windowMs: 15 * 60 * 1000, max: 8, keyFn: rateLimitAuth, message: 'Too many account attempts. Try hard buddy — it’s built different. — Aseebdev' }),
  async (req, res) => {
  const pool = dbRequired(res);
  if (!pool) return;

  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({ error: { message: 'Name must be 2–60 characters.' } });
  }
  if (!EMAIL_RE.test(email) || email.length > 160) {
    return res.status(400).json({ error: { message: 'Enter a valid email address.' } });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: { message: 'Password must be 8–128 characters.' } });
  }

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rowCount) {
      return res.status(409).json({ error: { message: 'An account with that email already exists.' } });
    }

    const id = newId();
    const ownerEmail = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
    const role = ownerEmail && email === ownerEmail ? 'owner' : 'user';

    await pool.query(
      'INSERT INTO users (id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5)',
      [id, name, email, hashPassword(password), role]
    );

    const token = signToken({ sub: id, email, name, role });
    setSessionCookie(res, token);

    res.status(201).json({
      user: { id, name, email, role },
      astraKeyConfigured: false
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: { message: 'An account with that email already exists.' } });
    }
    console.error('Registration error:', err);
    res.status(500).json({ error: { message: 'Could not create the account.' } });
  }
});

router.post('/login',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'Too many login attempts. Try hard buddy — it’s built different. — Aseebdev' }),
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyFn: rateLimitAuth, message: 'Too many login attempts. Try hard buddy — it’s built different. — Aseebdev' }),
  async (req, res) => {
  const pool = dbRequired(res);
  if (!pool) return;

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!EMAIL_RE.test(email) || !password) {
    return res.status(400).json({ error: { message: 'Enter your email and password.' } });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, password_hash, role, astra_api_key_encrypted FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: { message: 'Incorrect email or password.' } });
    }

    const token = signToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    });
    setSessionCookie(res, token);

    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      astraKeyConfigured: Boolean(user.astra_api_key_encrypted)
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: { message: 'Could not complete login.' } });
  }
});



router.get('/astra-key', requireAuth, async (req, res) => {
  const pool = dbRequired(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      'SELECT astra_api_key_encrypted FROM users WHERE id = $1',
      [req.user.sub]
    );
    if (!result.rowCount) return res.status(404).json({ error: { message: 'Account not found.' } });
    res.json({ configured: Boolean(result.rows[0].astra_api_key_encrypted) });
  } catch (err) {
    console.error('Astra key status error:', err);
    res.status(500).json({ error: { message: 'Could not load Astra key status.' } });
  }
});

router.put('/astra-key', requireAuth, rateLimit({ windowMs: 10 * 60 * 1000, max: 10, keyFn: req => req.user?.sub || 'unknown', message: 'Too many API-key changes. Try hard buddy — it’s built different. — Aseebdev' }), async (req, res) => {
  const pool = dbRequired(res);
  if (!pool) return;
  const key = String(req.body?.key || '').trim();
  if (!key) return res.status(400).json({ error: { message: 'Astra API key is required.' } });
  if (key.length > 512) return res.status(400).json({ error: { message: 'Astra API key is too long.' } });

  try {
    const encrypted = encryptSecret(key);
    await pool.query('UPDATE users SET astra_api_key_encrypted = $1 WHERE id = $2', [encrypted, req.user.sub]);
    res.json({ ok: true, configured: true });
  } catch (err) {
    console.error('Astra key save error:', err);
    res.status(500).json({ error: { message: 'Could not securely save your Astra API key.' } });
  }
});

router.delete('/astra-key', requireAuth, rateLimit({ windowMs: 10 * 60 * 1000, max: 10, keyFn: req => req.user?.sub || 'unknown', message: 'Too many API-key changes. Try hard buddy — it’s built different. — Aseebdev' }), async (req, res) => {
  const pool = dbRequired(res);
  if (!pool) return;
  try {
    await pool.query('UPDATE users SET astra_api_key_encrypted = NULL WHERE id = $1', [req.user.sub]);
    res.json({ ok: true, configured: false });
  } catch (err) {
    console.error('Astra key delete error:', err);
    res.status(500).json({ error: { message: 'Could not remove your Astra API key.' } });
  }
});

async function getStoredAstraKey(userId) {
  const pool = getPool();
  if (!pool || !userId) return '';
  const result = await pool.query('SELECT astra_api_key_encrypted FROM users WHERE id = $1', [userId]);
  return decryptSecret(result.rows[0]?.astra_api_key_encrypted || '');
}

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const pool = dbRequired(res);
  if (!pool) return;

  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at, (astra_api_key_encrypted IS NOT NULL) AS astra_key_configured FROM users WHERE id = $1',
      [req.user.sub]
    );
    if (!result.rowCount) {
      clearSessionCookie(res);
      return res.status(401).json({ error: { message: 'Account no longer exists.' } });
    }
    const user = result.rows[0];
    res.json({ user });
  } catch (err) {
    console.error('Session lookup error:', err);
    res.status(500).json({ error: { message: 'Could not load your account.' } });
  }
});

router.getStoredAstraKey = getStoredAstraKey;

module.exports = router;
