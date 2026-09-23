const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const { requireAuth } = require('../auth');

const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES = 2500;

function dbRequired(res) {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ error: { message: 'Database is not configured yet.' } });
    return null;
  }
  return pool;
}

router.get('/', requireAuth, async (req, res) => {
  const pool = dbRequired(res);
  if (!pool) return;

  try {
    const [convs, msgs] = await Promise.all([
      pool.query(
        `SELECT id, title, model, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`,
        [req.user.sub, MAX_CONVERSATIONS]
      ),
      pool.query(
        `SELECT id, conversation_id AS "conversationId", role, content, model, created_at AS "createdAt"
         FROM messages WHERE user_id = $1 ORDER BY created_at ASC LIMIT $2`,
        [req.user.sub, MAX_MESSAGES]
      )
    ]);
    res.json({ conversations: convs.rows, messages: msgs.rows });
  } catch (err) {
    console.error('Data load error:', err);
    res.status(500).json({ error: { message: 'Could not load your saved chats.' } });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const pool = dbRequired(res);
  if (!pool) return;

  const conversations = Array.isArray(req.body?.conversations) ? req.body.conversations : [];
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

  if (conversations.length > MAX_CONVERSATIONS || messages.length > MAX_MESSAGES) {
    return res.status(413).json({ error: { message: 'Your saved chat data exceeds the account storage limit.' } });
  }

  const convIds = new Set(conversations.map(c => String(c.id || '')));
  for (const c of conversations) {
    if (!c?.id || !c?.title) return res.status(400).json({ error: { message: 'Invalid conversation data.' } });
  }
  for (const m of messages) {
    if (!m?.id || !convIds.has(String(m.conversationId))) {
      return res.status(400).json({ error: { message: 'Invalid message data.' } });
    }
    if (!['user','assistant','system'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 100000) {
      return res.status(400).json({ error: { message: 'Invalid message content.' } });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM messages WHERE user_id = $1', [req.user.sub]);
    await client.query('DELETE FROM conversations WHERE user_id = $1', [req.user.sub]);

    for (const c of conversations) {
      await client.query(
        `INSERT INTO conversations (id,user_id,title,model,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          String(c.id),
          req.user.sub,
          String(c.title).slice(0, 100),
          c.model ? String(c.model).slice(0, 160) : null,
          Number(c.createdAt) || Date.now(),
          Number(c.updatedAt) || Date.now()
        ]
      );
    }

    for (const m of messages) {
      await client.query(
        `INSERT INTO messages (id,user_id,conversation_id,role,content,model,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          String(m.id),
          req.user.sub,
          String(m.conversationId),
          m.role,
          String(m.content),
          m.model ? String(m.model).slice(0, 160) : null,
          Number(m.createdAt) || Date.now()
        ]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, conversations: conversations.length, messages: messages.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Data save error:', err);
    res.status(500).json({ error: { message: 'Could not save your chats.' } });
  } finally {
    client.release();
  }
});

module.exports = router;
