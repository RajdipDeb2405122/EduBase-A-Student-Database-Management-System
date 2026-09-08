const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap, check, transaction, text, id,
  email, password, date, safe, log
} = require('./common');

const { createAccount } = require('./accounts');

const table = role => role === 'student'
  ? 'student_registration_requests'
  : 'faculty_registration_requests';

function regNumber(value, required = false) {
  const n = text(
    value,
    'registration number',
    50,
    required
  );

  check(
    !n || (
      /^\d{7}$/.test(n) &&
      Number(n.slice(0, 2)) >= 21 &&
      Number(n.slice(0, 2)) <= 30
    ),
    'Registration number must contain 7 digits and start with 21–30'
  );

  return n;
}

function register(role) {
  return wrap(async (req, res) => {
    const b = req.body;
    const name = text(b.full_name, 'full name');
    const mail = email(b.email);
    const phone = text(b.phone, 'phone', 20, false);

    const hash = await bcrypt.hash(
      password(b.password),
      12
    );

    const result = await transaction(async db => {
      await db.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [mail]
      );

      const exists = await db.query(`
        SELECT 1 FROM users WHERE lower(btrim(email))=$1

        UNION ALL

        SELECT 1 FROM student_registration_requests
        WHERE lower(btrim(email))=$1 AND status='pending'

        UNION ALL

        SELECT 1 FROM faculty_registration_requests
        WHERE lower(btrim(email))=$1 AND status='pending'
      `, [mail]);

      check(
        !exists.rowCount,
        'Email is already registered or has a pending request',
        409
      );

      if (role === 'student') {
        const reg = regNumber(b.registration_no);

        if (reg) {
          const s = await db.query(
            'SELECT 1 FROM student WHERE registration_no=$1',
            [reg]
          );

          check(
            !s.rowCount,
            'Registration number is already in use',
            409
          );
        }

        return db.query(`
          INSERT INTO student_registration_requests (
            registration_no,full_name,email,phone,
            date_of_birth,program_id,password_hash
          )
          VALUES($1,$2,$3,$4,$5,$6,$7)
          RETURNING request_id
        `, [
          reg,
          name,
          mail,
          phone,
          date(b.date_of_birth, 'date of birth'),
          id(b.program_id, 'program'),
          hash
        ]);
      }

      return db.query(`
        INSERT INTO faculty_registration_requests (
          full_name,email,phone,department_id,
          designation,password_hash
        )
        VALUES($1,$2,$3,$4,$5,$6)
        RETURNING request_id
      `, [
        name,
        mail,
        phone,
        id(b.department_id, 'department'),
        text(b.designation || 'Lecturer', 'designation', 50),
        hash
      ]);
    });

    res.status(201).json({
      request_id: result.rows[0].request_id,
      message: 'Request submitted. Wait for admin approval.'
    });
  });
}

function requests(role) {
  const router = express.Router();

  router.use(auth, auth.requireAdmin);

  const t = table(role);

  const list = fixed => wrap(async (req, res) => {
    const status = fixed || req.query.status || null;

    check(
      !status || ['pending', 'approved', 'rejected'].includes(status),
      'Invalid request status'
    );

    const related = role === 'student'
      ? `
        p.program_name
        FROM student_registration_requests r
        LEFT JOIN program p ON p.program_id=r.program_id
      `
      : `
        d.department_name
        FROM faculty_registration_requests r
        LEFT JOIN department d ON d.department_id=r.department_id
      `;

    const r = await pool.query(`
      SELECT r.*,u.full_name AS reviewed_by_name,${related}
      LEFT JOIN admin a ON a.admin_id=r.reviewed_by_admin_id
      LEFT JOIN users u ON u.user_id=a.user_id
      WHERE ($1::text IS NULL OR r.status=$1)
      ORDER BY r.requested_on DESC
    `, [status]);

    res.json(r.rows.map(safe));
  });

  router.get('/pending', list('pending'));
  router.get('/', list(null));

  router.put('/:id/approve', wrap(async (req, res) => {
    const result = await transaction(async db => {
      const r = await db.query(`
        SELECT * FROM ${t}
        WHERE request_id=$1
        FOR UPDATE
      `, [id(req.params.id)]);

      check(
        r.rowCount && r.rows[0].status === 'pending',
        'Request not found or already processed',
        409
      );

      const request = r.rows[0];
      const body = { ...request, status: 'active' };

      if (role === 'student') {
        body.registration_no = regNumber(
          req.body.registration_no || request.registration_no,
          true
        );

        body.advisor_id = id(req.body.advisor_id, 'advisor');
      }

      const created = await createAccount(
        db,
        role,
        body,
        req.admin.admin_id,
        request.password_hash
      );

      await db.query(`
        UPDATE ${t}
        SET status='approved',
            reviewed_by_admin_id=$1,
            reviewed_on=CURRENT_TIMESTAMP,
            rejection_reason=NULL
        WHERE request_id=$2
      `, [req.admin.admin_id, request.request_id]);

      if (role === 'student') {
        await db.query(`
          UPDATE student_registration_requests
          SET registration_no=$1
          WHERE request_id=$2
        `, [body.registration_no, request.request_id]);
      }

      return created;
    });

    res.json({
      message: 'Registration approved',
      [role]: result
    });
  }));

  router.put('/:id/reject', wrap(async (req, res) => {
    await transaction(async db => {
      const reason = text(
        req.body.rejection_reason || 'No reason provided',
        'rejection reason',
        1000
      );

      const r = await db.query(`
        UPDATE ${t}
        SET status='rejected',
            reviewed_by_admin_id=$1,
            reviewed_on=CURRENT_TIMESTAMP,
            rejection_reason=$2
        WHERE request_id=$3 AND status='pending'
        RETURNING request_id
      `, [
        req.admin.admin_id,
        reason,
        id(req.params.id)
      ]);

      check(
        r.rowCount,
        'Request not found or already processed',
        409
      );

      await log(
        db, req.admin.admin_id, t,
        id(req.params.id), 'REJECT', reason
      );
    });

    res.json({ message: 'Registration rejected' });
  }));

  router.delete('/:id', wrap(async (req, res) => {
    const r = await pool.query(`
      DELETE FROM ${t}
      WHERE request_id=$1
      RETURNING request_id
    `, [id(req.params.id)]);

    check(r.rowCount, 'Request not found', 404);
    res.json({ message: 'Request deleted' });
  }));

  return router;
}

module.exports = { register, requests };