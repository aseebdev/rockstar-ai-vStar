const { getPool } = require('./db');

function getLimits(user) {
  const daily = Math.max(0, parseInt(process.env.DAILY_MESSAGE_LIMIT, 10) || 20);
  const monthly = Math.max(0, parseInt(process.env.MONTHLY_MESSAGE_LIMIT, 10) || 500);
  return user.role === 'owner'
    ? { daily: null, monthly: null }
    : { daily, monthly };
}

async function reserveUsage(userId, role) {
  const pool = getPool();
  if (!pool) throw Object.assign(new Error('Database is not configured.'), { statusCode: 503 });

  const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
  if (!userResult.rowCount) throw Object.assign(new Error('Account not found.'), { statusCode: 401 });

  const user = { role: userResult.rows[0].role };
  const limits = getLimits(user);

  if (user.role === 'owner') {
    return { allowed: true, daily: null, monthly: null, dailyRemaining: null, monthlyRemaining: null };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);

    const result = await client.query(
      `INSERT INTO usage_counters (user_id, day_key, daily_count, month_key, monthly_count)
       VALUES ($1, CURRENT_DATE, 1, DATE_TRUNC('month', CURRENT_DATE)::DATE, 1)
       ON CONFLICT (user_id) DO UPDATE SET
         day_key = CURRENT_DATE,
         daily_count = CASE
           WHEN usage_counters.day_key = CURRENT_DATE THEN usage_counters.daily_count + 1
           ELSE 1
         END,
         month_key = DATE_TRUNC('month', CURRENT_DATE)::DATE,
         monthly_count = CASE
           WHEN usage_counters.month_key = DATE_TRUNC('month', CURRENT_DATE)::DATE THEN usage_counters.monthly_count + 1
           ELSE 1
         END
       RETURNING daily_count, monthly_count`
    , [userId]);

    const row = result.rows[0];
    const overDaily = row.daily_count > limits.daily;
    const overMonthly = row.monthly_count > limits.monthly;

    if (overDaily || overMonthly) {
      await client.query('ROLLBACK');
      return {
        allowed: false,
        reason: overDaily ? 'daily' : 'monthly',
        daily: limits.daily,
        monthly: limits.monthly,
        dailyRemaining: Math.max(0, limits.daily - row.daily_count + 1),
        monthlyRemaining: Math.max(0, limits.monthly - row.monthly_count + 1)
      };
    }

    await client.query('COMMIT');
    return {
      allowed: true,
      daily: limits.daily,
      monthly: limits.monthly,
      dailyRemaining: Math.max(0, limits.daily - row.daily_count),
      monthlyRemaining: Math.max(0, limits.monthly - row.monthly_count)
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function releaseUsage(userId) {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `UPDATE usage_counters
     SET daily_count = GREATEST(daily_count - 1, 0),
         monthly_count = GREATEST(monthly_count - 1, 0)
     WHERE user_id = $1`,
    [userId]
  );
}

async function getUsage(userId) {
  const pool = getPool();
  if (!pool) return null;

  const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
  if (!userResult.rowCount) return null;

  const role = userResult.rows[0].role;
  const limits = getLimits({ role });
  if (role === 'owner') {
    return { role, daily: null, monthly: null, dailyRemaining: null, monthlyRemaining: null };
  }

  const result = await pool.query(
    `SELECT daily_count, monthly_count
     FROM usage_counters WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0] || { daily_count: 0, monthly_count: 0 };
  return {
    role,
    daily: limits.daily,
    monthly: limits.monthly,
    dailyUsed: row.daily_count,
    monthlyUsed: row.monthly_count,
    dailyRemaining: Math.max(0, limits.daily - row.daily_count),
    monthlyRemaining: Math.max(0, limits.monthly - row.monthly_count)
  };
}

module.exports = { getLimits, reserveUsage, releaseUsage, getUsage };
