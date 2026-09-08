const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const auth = require('../middleware/auth');
const { profile } = require('./accounts');

const {
  check,
  text,
  email,
  transaction
} = require('./common');

async function session(user, db = pool) {
  return {
    user: {
      user_id: user.user_id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      role: user.role
    },

    profile: await profile(
      db,
      user.role,
      user[`${user.role}_id`]
    )
  };
}

function login(role) {
  return async (req, res) => {
    const identifier = role === 'admin'
      ? text(req.body.username, 'username', 50)
      : email(req.body.email);

    check(
      typeof req.body.password === 'string' &&
      Buffer.byteLength(req.body.password) <= 72,
      'Invalid credentials',
      401
    );

    const result = await transaction(async db => {
      const found = await db.query(`
        ${auth.query}

        WHERE u.role=$1
          AND ${
            role === 'admin'
              ? 'u.username=$2'
              : 'lower(btrim(u.email))=$2'
          }

        FOR UPDATE OF u
      `, [role, identifier]);

      const user = found.rows[0];
      let valid = false;

      if (user) {
        const credentials = await db.query(
          'SELECT password_hash FROM users WHERE user_id=$1',
          [user.user_id]
        );

        valid = await bcrypt.compare(
          req.body.password,
          credentials.rows[0].password_hash
        );
      }

      check(
        valid && auth.active(user),
        'Invalid credentials or account awaiting approval/inactive',
        401
      );

      await db.query(`
        UPDATE users
        SET last_login=CURRENT_TIMESTAMP
        WHERE user_id=$1
      `, [user.user_id]);

      if (role === 'admin') {
        await db.query(`
          UPDATE admin
          SET last_login=CURRENT_TIMESTAMP
          WHERE admin_id=$1
        `, [user.admin_id]);
      }

      const token = await auth.createSession(db, user);
      const data = await session(user, db);

      return {
        token,
        ...data,
        ...(role === 'admin'
          ? { admin: data.profile }
          : data.profile)
      };
    });

    res
      .set('Cache-Control', 'no-store')
      .json(result);
  };
}

module.exports = {
  login,
  session
};