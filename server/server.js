const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const toolsRoutes = require('./routes/tools');
const { securityHeaders, sameOriginGuard, rateLimit } = require('./middleware/security');
const { errorHandler } = require('./middleware/errorHandler');
const { initDb } = require('./db');
const logger = require('./utils/logger');

const app = express();

let dbInitPromise = null;
if (process.env.VERCEL) {
  app.use(async (req, res, next) => {
    try {
      if (!dbInitPromise) dbInitPromise = initDb();
      await dbInitPromise;
      next();
    } catch (err) {
      // Never leave a rejected initialization promise cached in a warm Vercel
      // function. A transient Supabase/network failure would otherwise make
      // every later request fail with the same 500 until the function is recycled.
      dbInitPromise = null;
      logger.error(`[DB_INIT][${req.method} ${req.url}] Database initialization failed:`, err?.message || err);
      const safe = Object.assign(new Error('Database initialization failed. Please try again.'), {
        statusCode: 503,
        expose: true,
        code: 'DB_INIT_FAILED'
      });
      next(safe);
    }
  });
}

if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(securityHeaders);
app.use(sameOriginGuard);
app.use(rateLimit({ max: 180, message: 'Too many requests. Try hard buddy — it’s built different. — Aseebdev' }));

const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',').map(v => v.trim()).filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : false,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Astra-Key'],
  maxAge: 600
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '512kb' }));

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true
}));

// Login music is a public static asset. Keeping it under /public makes the
// asset available both locally and on Vercel.
app.get('/rraudio.mp3', (req, res, next) => {
  res.sendFile(path.join(publicDir, 'rraudio.mp3'), (err) => {
    if (err) next(err);
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api', apiRoutes);

app.get('/share/:token', (req, res) => {
  const token = String(req.params.token).replace(/[^A-Za-z0-9_-]/g, '');
  res.type('html').send(`<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Rockstar AI • Shared conversation</title><style>body{font-family:system-ui,sans-serif;background:#080b12;color:#eef2ff;margin:0;padding:32px}main{max-width:900px;margin:auto}.card{background:#111827;border:1px solid #263148;border-radius:18px;padding:24px;margin:18px 0}pre{white-space:pre-wrap;word-break:break-word}h1{font-size:28px}</style></head><body><main id=\"app\"><div class=\"card\">Loading secure conversation…</div></main><script>const token=${JSON.stringify(token)};fetch('/api/tools/share/'+token).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||'Share unavailable');document.title='Rockstar AI • '+d.conversation.title;document.getElementById('app').innerHTML='<h1>'+esc(d.conversation.title)+'</h1>'+d.conversation.messages.map(m=>'<section class=\"card\"><strong>'+esc(m.role)+'</strong><pre>'+esc(m.content)+'</pre></section>').join('')}).catch(e=>document.getElementById('app').innerHTML='<div class=\"card\"><h1>Share unavailable</h1><p>'+esc(e.message)+'</p></div>');function esc(s){return String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}</script></body></html>`);
});

app.get('*', (req, res, next) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(publicDir, 'index.html'));
  } else {
    next();
  }
});

app.use(errorHandler);

async function start() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      throw new Error('Production startup blocked: SESSION_SECRET must be at least 32 characters.');
    }
    if (!process.env.DATABASE_URL) {
      throw new Error('Production startup blocked: DATABASE_URL is required.');
    }
    if (String(process.env.HOST || '').trim() !== '0.0.0.0' && !process.env.HOST) {
      // no-op: hosting platforms normally provide their own binding configuration
    }
  }

  try {
    const dbReady = await initDb();
    if (process.env.NODE_ENV === 'production' && !dbReady) {
      throw new Error('Production startup blocked: database is unavailable.');
    }
  } catch (err) {
    logger.error('Database initialization failed:', err.message);
    if (process.env.NODE_ENV === 'production') throw err;
  }

  app.listen(PORT, HOST, () => {
    console.log('');
    console.log('  \x1b[35m┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\x1b[0m');
    console.log('  \x1b[35m┃\x1b[0m   \x1b[1m\x1b[36m✦ ROCKSTAR AI\x1b[0m                               \x1b[35m┃\x1b[0m');
    console.log('  \x1b[35m┃\x1b[0m   Personal AI interface • BYOK • Cloud-ready     \x1b[35m┃\x1b[0m');
    console.log('  \x1b[35m┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\x1b[0m');
    console.log('');
    console.log(`  \x1b[32m✔ Server running: http://localhost:${PORT}\x1b[0m`);
    console.log(`  • Database: ${process.env.DATABASE_URL ? '\x1b[32mConfigured\x1b[0m' : '\x1b[33mNot configured\x1b[0m'}`);
    console.log('  • AI billing: \x1b[36mEach user must use their own Astra API key\x1b[0m');
    console.log(`  • Daily user limit: \x1b[36m${process.env.DAILY_MESSAGE_LIMIT || 20}\x1b[0m`);
    console.log(`  • Monthly user limit: \x1b[36m${process.env.MONTHLY_MESSAGE_LIMIT || 500}\x1b[0m`);
    console.log('');
    console.log('  \x1b[90mPress CTRL+C to stop the server.\x1b[0m');
    console.log('');
  });
}

// Vercel runs the exported Express app as the serverless/Fluid Compute entrypoint.
// Only start a listening TCP server during local/self-hosted execution.
if (!process.env.VERCEL) {
  start();
}

module.exports = app;
