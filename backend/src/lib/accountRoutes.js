const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap, check, id, password, transaction, log
} = require('./common');

const {
  tables, selects, aliases, profile,
  createAccount, updateAccount
} = require('./accounts');

module.exports = function accountRoutes(role) {
  const router = express.Router();

  router.use(auth, auth.requireAdmin);

  const select = selects[role];
  const alias = aliases[role];

  router.get('/', wrap(async (req, res) => {
    const values = [];
    const conditions = [];

    const add = (sql, value) => {
      values.push(value);
      conditions.push(sql.replace('?', `$${values.length}`));
    };

    if (role === 'student') {
      if (req.query.search) {
        values.push(`%${String(req.query.search).slice(0, 100)}%`);

        conditions.push(`
          (s.full_name ILIKE $1
           OR s.registration_no ILIKE $1
           OR s.email ILIKE $1)
        `);
      }

      if (req.query.status) {
        add('s.current_status=?', req.query.status);
      }

      if (req.query.program_id) {
        add('s.program_id=?', id(req.query.program_id));
      }
    }

    if (role === 'faculty' && req.query.department_id) {
      add('f.department_id=?', id(req.query.department_id));
    }

    const r = await pool.query(`
      ${select}
      ${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''}
      ORDER BY ${role === 'admin' ? 'u.full_name' : `${alias}.full_name`}
    `, values);

    res.json(r.rows);
  }));

  if (role === 'admin') {
    router.get('/logs/recent', wrap(async (req, res) => {
      const limit = Math.min(
        id(req.query.limit || 50, 'limit'),
        500
      );

      const r = await pool.query(`
        SELECT l.*,u.username,u.full_name AS admin_name
        FROM admin_action_log l
        LEFT JOIN admin a ON a.admin_id=l.admin_id
        LEFT JOIN users u ON u.user_id=a.user_id
        ORDER BY l.action_timestamp DESC,l.log_id DESC
        LIMIT $1
      `, [limit]);

      res.json(r.rows);
    }));
  }

  if (role === 'faculty') {
    router.get('/department/:deptId', wrap(async (req, res) => {
      const r = await pool.query(`
        ${select}
        WHERE f.department_id=$1
        ORDER BY f.full_name
      `, [id(req.params.deptId)]);

      res.json(r.rows);
    }));
  }

  if (role === 'student') {
    router.get('/reg/:regNo', wrap(async (req, res) => {
      const r = await pool.query(`
        ${select} WHERE s.registration_no=$1
      `, [req.params.regNo]);

      check(r.rowCount, 'Student not found', 404);
      res.json(r.rows[0]);
    }));

    const queries = {
      enrollments: `
        SELECT e.*,c.course_code,c.course_title,c.credit_hours,
          a.full_name AS authorized_by_name
        FROM enrollment e
        JOIN course c ON c.course_id=e.course_id
        LEFT JOIN admin_public a
          ON a.admin_id=e.authorized_by_admin_id
        WHERE e.student_id=$1
        ORDER BY e.academic_year DESC,e.term
      `,
      payments: `
        SELECT * FROM payment
        WHERE student_id=$1 ORDER BY paid_on DESC
      `,
      scholarships: `
        SELECT * FROM scholarship
        WHERE student_id=$1 ORDER BY awarded_on DESC
      `
    };

    for (const [name, sql] of Object.entries(queries)) {
      router.get(`/:id/${name}`, wrap(async (req, res) => {
        res.json(
          (await pool.query(sql, [id(req.params.id)])).rows
        );
      }));
    }
  }

  router.get('/:id', wrap(async (req, res) => {
    res.json(await profile(pool, role, id(req.params.id)));
  }));

  router.post('/', wrap(async (req, res) => {
    const result = await transaction(db =>
      createAccount(db, role, req.body, req.admin.admin_id)
    );

    res.status(201).json(result);
  }));

  router.put('/:id', wrap(async (req, res) => {
    const result = await transaction(db =>
      updateAccount(
        db,
        role,
        id(req.params.id),
        req.body,
        req.admin.admin_id
      )
    );

    res.json(result);
  }));

  router.post('/:id/reset-password', wrap(async (req, res) => {
    const hash = await bcrypt.hash(
      password(req.body.newPassword),
      12
    );

    await transaction(async db => {
      const r = await db.query(`
        UPDATE users u
        SET password_hash=$1,token_version=token_version+1
        FROM ${tables[role]} p
        WHERE p.user_id=u.user_id
          AND p.${role}_id=$2
        RETURNING u.user_id
      `, [hash, id(req.params.id)]);

      check(r.rowCount, 'Account not found', 404);

      await log(
        db,
        req.admin.admin_id,
        role,
        id(req.params.id),
        'RESET',
        'Password reset'
      );
    });

    res.json({
      message: 'Password reset. Previous sessions are invalidated.'
    });
  }));

  router.delete('/:id', wrap(async (req, res) => {
    const key = id(req.params.id);

    check(
      !(role === 'admin' && key === req.admin.admin_id),
      'You cannot delete your own account'
    );

    await transaction(async db => {
      const p = await profile(db, role, key);

      // Deleting the parent cascades to the matching subtype.
      // Faculty with exam history are protected by the exam FK.
      await db.query(
        'DELETE FROM users WHERE user_id=$1',
        [p.user_id]
      );

      await log(
        db, req.admin.admin_id, role, key, 'DELETE',
        `Deleted ${role}: ${p.full_name}`
      );
    });

    res.json({ message: 'Account deleted' });
  }));

  return router;
};