const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap,
  check,
  id,
  text,
  transaction,
  log
} = require('../lib/common');

const {
  requestTerm,
  approve,
  registrationSQL
} = require('../lib/termRegistration');

const { termLabel } = require('../lib/academic');

router.use(auth);

// The student submits every course of their current term at once.
router.post(
  '/request',
  auth.requireStudent,
  wrap(async (req, res) => {
    check(
      req.body.student_id == null ||
        id(req.body.student_id) === req.user.student_id,
      'You cannot register for another student',
      403
    );

    const registration = await transaction(db =>
      requestTerm(db, req.user.student_id, req.body)
    );

    res.status(201).json({
      message: 'Term registration requested',
      registration
    });
  })
);

router.use(auth.requireAdmin);

const list = fixed => wrap(async (req, res) => {
  const status = fixed || req.query.status || null;

  check(
    !status ||
      ['pending', 'approved', 'rejected'].includes(status),
    'Invalid status'
  );

  const result = await pool.query(`
    ${registrationSQL}
    WHERE ($1::text IS NULL OR r.status=$1)
    ORDER BY r.requested_on DESC
  `, [status]);

  res.json(result.rows);
});

router.get('/pending', list('pending'));
router.get('/', list(null));

router.put('/:id/approve', wrap(async (req, res) => {
  await transaction(async db => {
    const { registration, courses } = await approve(
      db,
      id(req.params.id),
      req.admin.admin_id
    );

    await log(
      db,
      req.admin.admin_id,
      'term_registration',
      registration.registration_id,
      'AUTHORIZE',
      `Approved term ${termLabel(registration.level, registration.term)} ` +
        `registration (${courses.map(c => c.course_code).join(', ')}); ` +
        'awaiting student payment'
    );
  });

  res.json({
    message:
      'Registration approved. The student must pay the ৳1000 demo fee for each course to complete it.'
  });
}));

router.put('/:id/reject', wrap(async (req, res) => {
  await transaction(async db => {
    const result = await db.query(`
      UPDATE term_registration
      SET status='rejected',
          reviewed_by_admin_id=$1,
          reviewed_on=CURRENT_TIMESTAMP,
          rejection_reason=$2
      WHERE registration_id=$3
        AND status='pending'
      RETURNING registration_id
    `, [
      req.admin.admin_id,

      text(
        req.body.rejection_reason || 'No reason provided',
        'reason',
        1000
      ),

      id(req.params.id)
    ]);

    check(
      result.rowCount,
      'Registration not found or already processed',
      409
    );

    await log(
      db,
      req.admin.admin_id,
      'term_registration',
      id(req.params.id),
      'REJECT',
      'Rejected term registration'
    );
  });

  res.json({
    message: 'Term registration rejected'
  });
}));

module.exports = router;
