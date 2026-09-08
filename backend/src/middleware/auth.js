const crypto = require('crypto');
const pool = require('../config/database');
const { wrap, check } = require('../lib/common');

const query = `
  SELECT
    u.user_id,
    u.username,
    u.email,
    u.full_name,
    u.role,
    u.status,
    u.token_version,

    a.admin_id,
    a.role AS admin_role,
    a.status AS admin_status,

    s.student_id,
    s.current_status,

    f.faculty_id,
    f.department_id

  FROM users u

  LEFT JOIN admin a
    ON a.user_id=u.user_id

  LEFT JOIN student s
    ON s.user_id=u.user_id

  LEFT JOIN faculty f
    ON f.user_id=u.user_id
`;

const hashToken = token =>
  crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

const validToken = token =>
  typeof token === 'string' &&
  /^[a-f0-9]{64}$/.test(token);

function active(user) {
  return Boolean(
    user &&
    user.status === 'active' &&
    (
      user.role === 'admin'
        ? user.admin_id && user.admin_status === 'active'
        : user.role === 'student'
          ? user.student_id && user.current_status === 'active'
          : user.role === 'faculty'
            ? user.faculty_id
            : false
    )
  );
}

// Only a digest is stored in PostgreSQL.
// The original token is returned to the authenticated client.
async function createSession(db, user) {
  const token = crypto.randomBytes(32).toString('hex');

  await db.query(`
    INSERT INTO login_session (
      user_id,
      token_hash,
      token_version,
      role
    )
    VALUES($1,$2,$3,$4)
  `, [
    user.user_id,
    hashToken(token),
    user.token_version,
    user.role
  ]);

  return token;
}

async function revokeSession(token) {
  if (!validToken(token)) return;

  await pool.query(`
    UPDATE login_session
    SET revoked_at=CURRENT_TIMESTAMP
    WHERE token_hash=$1
      AND revoked_at IS NULL
  `, [hashToken(token)]);
}

const auth = wrap(async (req, res, next) => {
  if (req.user) return next();

  const match = /^Bearer\s+(\S+)$/i.exec(
    req.get('Authorization') || ''
  );

  check(
    match && validToken(match[1]),
    'Please sign in to this portal',
    401
  );

  const result = await pool.query(`
    ${query}

    JOIN login_session ls
      ON ls.user_id=u.user_id

    WHERE ls.token_hash=$1
      AND ls.revoked_at IS NULL
      AND ls.token_version=u.token_version
      AND ls.role=u.role
  `, [hashToken(match[1])]);

  const user = result.rows[0];

  check(
    active(user),
    'Session revoked or account inactive. Please sign in again.',
    401
  );

  req.user = user;
  req.sessionToken = match[1];

  if (user.role === 'admin') {
    req.admin = user;
  }

  if (user.role === 'student') {
    req.student = user;
  }

  if (user.role === 'faculty') {
    req.faculty = user;
  }

  next();
});

const allow = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      error: 'Access denied'
    });
  }

  next();
};

module.exports = auth;

Object.assign(module.exports, {
  query,
  active,
  createSession,
  revokeSession,
  allow,
  requireAdmin: allow('admin'),
  requireStudent: allow('student'),
  requireFaculty: allow('faculty')
});