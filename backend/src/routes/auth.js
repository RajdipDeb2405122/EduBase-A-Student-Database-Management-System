const router = require('express').Router();
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const { login, session } = require('../lib/login');

const {
  wrap,
  check,
  password,
  transaction
} = require('../lib/common');

router.post('/login', wrap(login('admin')));

router.get('/session', auth, wrap(async (req, res) => {
  res
    .set('Cache-Control', 'no-store')
    .json(await session(req.user));
}));

router.get(
  '/me',
  auth,
  auth.requireAdmin,
  wrap(async (req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .json((await session(req.user)).profile);
  })
);

// Revoke only the supplied session.
// Other roles and other devices are not logged out.
router.post('/logout', wrap(async (req, res) => {
  const match = /^Bearer\s+(\S+)$/i.exec(
    req.get('Authorization') || ''
  );

  if (match) {
    await auth.revokeSession(match[1]);
  }

  res.json({ message: 'Logged out' });
}));

router.post(
  '/change-password',
  auth,
  wrap(async (req, res) => {
    const nextPassword = password(req.body.newPassword);

    check(
      typeof req.body.currentPassword === 'string',
      'Current password is required'
    );

    await transaction(async db => {
      const result = await db.query(`
        SELECT password_hash
        FROM users
        WHERE user_id=$1
        FOR UPDATE
      `, [req.user.user_id]);

      check(
        await bcrypt.compare(
          req.body.currentPassword,
          result.rows[0].password_hash
        ),
        'Current password is incorrect'
      );

      await db.query(`
        UPDATE users
        SET password_hash=$1,
            token_version=token_version+1
        WHERE user_id=$2
      `, [
        await bcrypt.hash(nextPassword, 12),
        req.user.user_id
      ]);
    });

    res.json({
      message: 'Password changed. Please sign in again.'
    });
  })
);

module.exports = router;