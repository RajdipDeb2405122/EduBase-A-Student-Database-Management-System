const pool = require('../config/database');

const wrap = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function check(ok, message, status = 400) {
  if (!ok) {
    throw Object.assign(new Error(message), { status });
  }
}

async function transaction(fn) {
  const db = await pool.connect();

  try {
    await db.query('BEGIN');
    const value = await fn(db);
    await db.query('COMMIT');
    return value;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

function text(value, label, max = 100, required = true) {
  check(
    value == null || typeof value === 'string',
    `${label} must be text`
  );

  const result = (value ?? '').trim();

  check(
    (!required || result.length > 0) && result.length <= max,
    `Invalid ${label}`
  );

  return result || null;
}

function id(value, label = 'ID', optional = false) {
  if (optional && (value == null || value === '')) {
    return null;
  }

  check(/^\d+$/.test(String(value)), `Invalid ${label}`);

  const number = Number(value);

  check(
    Number.isSafeInteger(number) &&
      number > 0 &&
      number <= 2147483647,
    `Invalid ${label}`
  );

  return number;
}

function email(value) {
  const result = text(value, 'email').toLowerCase();

  check(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result),
    'Invalid email'
  );

  return result;
}

function password(value) {
  check(
    typeof value === 'string' &&
      value.length >= 8 &&
      Buffer.byteLength(value, 'utf8') <= 72,
    'Password must be at least 8 characters and at most 72 UTF-8 bytes'
  );

  return value;
}

function date(value, label = 'date', required = false) {
  if (value == null || value === '') {
    check(!required, `${label} is required`);
    return null;
  }

  const result = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value);

  const parsed = new Date(`${result}T00:00:00Z`);

  check(
    /^\d{4}-\d{2}-\d{2}$/.test(result) &&
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === result,
    `Invalid ${label}`
  );

  return result;
}

function number(value, label, min, max, optional = false) {
  if (optional && (value == null || value === '')) {
    return null;
  }

  check(
    value !== null &&
      value !== undefined &&
      value !== '' &&
      ['number', 'string'].includes(typeof value),
    `Invalid ${label}`
  );

  const n = Number(value);

  check(
    Number.isFinite(n) && n >= min && n <= max,
    `Invalid ${label}`
  );

  return Math.round(n * 100) / 100;
}

function grade(marks, total) {
  if (marks === null) return null;

  const percent = 100 * Number(marks) / Number(total);

  return [
    [90, 'A+'],
    [85, 'A'],
    [80, 'A-'],
    [75, 'B+'],
    [70, 'B'],
    [65, 'B-'],
    [60, 'C+'],
    [55, 'C'],
    [50, 'C-'],
    [40, 'D'],
    [0, 'F']
  ].find(([n]) => percent >= n)[1];
}

function safe(row) {
  if (!row) return row;

  const { password_hash, token_version, ...data } = row;
  return data;
}

async function log(db, adminId, table, targetId, action, detail) {
  await db.query(`
    INSERT INTO admin_action_log
      (admin_id,target_table,target_id,action_type,new_value)
    VALUES($1,$2,$3,$4,$5)
  `, [adminId, table, targetId, action, detail]);
}

function errors(error, req, res, next) {
  if (res.headersSent) return next(error);

  const codes = {
    '23505': [
      409,
      'This email, username, registration number or record already exists.'
    ],
    '23503': [
      409,
      'Referenced record is missing, or this record is still in use.'
    ],
    '23514': [
      400,
      'The values violate an account, enrollment or marks rule.'
    ],
    '22P02': [400, 'Invalid value.'],
    '22007': [400, 'Invalid date.'],
    '22008': [400, 'Invalid date.'],
    '22001': [400, 'A value is too long.'],
    '23502': [400, 'A required value is missing.']
  };

  const [status, message] = codes[error.code] || [
    error.status || 500,
    error.status ? error.message : 'Internal server error'
  ];

  if (status >= 500) console.error(error);

  res.status(status).json({ error: message });
}

module.exports = {
  wrap,
  check,
  transaction,
  text,
  id,
  email,
  password,
  date,
  number,
  grade,
  safe,
  log,
  errors
};