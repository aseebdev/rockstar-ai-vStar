const { Pool } = require('pg');
const crypto = require('crypto');
const logger = require('./utils/logger');

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: 5
    })
  : null;

async function initDb() {
  if (!pool) {
    logger.warn('DATABASE_URL is not configured. Public login/database features are unavailable until it is set.');
    return false;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      astra_api_key_encrypted TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS astra_api_key_encrypted TEXT;

    CREATE TABLE IF NOT EXISTS usage_counters (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      day_key DATE NOT NULL DEFAULT CURRENT_DATE,
      daily_count INTEGER NOT NULL DEFAULT 0,
      month_key DATE NOT NULL DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,
      monthly_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      model TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS conversations_user_updated_idx
      ON conversations(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
      content TEXT NOT NULL,
      model TEXT,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_user_conversation_idx
      ON messages(user_id, conversation_id, created_at);
  `);

  return true;
}

function getPool() {
  return pool;
}

function newId() {
  return crypto.randomUUID();
}

module.exports = { pool, getPool, initDb, newId };
