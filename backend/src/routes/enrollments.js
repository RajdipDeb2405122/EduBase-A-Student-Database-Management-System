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

const { enrollmentSQL } = require('../lib/courseFees');
const { authorize } = require('../lib/termRegistration');
const { termLabel } = require('../lib/academic');

router.use(auth, auth.requireAdmin);

router.get('/', wrap(async (req, res) => {
  const result = await pool.query(`
    ${enrollmentSQL}

    WHERE ($1::int IS NULL OR e.student_id=$1)
      AND ($2::text IS NULL OR e.academic_year=$2)
      AND ($3::text IS NULL OR e.term=$3)
      AND ($4::text IS NULL OR e.status=$4)

    ORDER BY
      e.academic_year DESC,
      e.term,
      s.registration_no
  `, [
    id(req.query.student_id, 'student', true),
    text(req.query.academic_year, 'academic year', 20, false),
    text(req.query.term, 'term', 20, false),
    text(req.query.status, 'status', 20, false)
  ]);

  res.json(result.rows);
}));

router.get('/:id', wrap(async (req, res) => {
  const result = await pool.query(`
    ${enrollmentSQL}
    WHERE e.enrollment_id=$1
  `, [id(req.params.id)]);

  check(
    result.rowCount,
    'Enrollment not found',
    404
  );

  res.json(result.rows[0]);
}));

// Registers a student for every course of their current term.
router.post('/', wrap(async (req, res) => {
  const allowed = [
    'student_id',
    'academic_year',
    'enrolled_on'
  ];

  check(
    Object.keys(req.body).every(
      key => allowed.includes(key)
    ),
    'Only student, academic year and date can be supplied'
  );

  const result = await transaction(async db => {
    const { registration, courses, student } = await authorize(
      db,
      req.body,
      req.admin.admin_id
    );

    await log(
      db,
      req.admin.admin_id,
      'term_registration',
      registration.registration_id,
      'AUTHORIZE',
      `Registered ${student.registration_no} for term ` +
        `${termLabel(registration.level, registration.term)}; ` +
        'awaiting student course-fee payments'
    );

    const records = await db.query(`
      ${enrollmentSQL}
      WHERE e.registration_id=$1
      ORDER BY c.course_code
    `, [registration.registration_id]);

    return {
      registration,
      courses: courses.length,
      enrollments: records.rows
    };
  });

  res.status(201).json(result);
}));

router.put('/:id', wrap(async (req, res) => {
  check(
    Object.keys(req.body).length === 1 &&
      Object.hasOwn(req.body, 'status'),
    'Only enrollment status can be updated'
  );

  check(
    [
      'pending_payment',
      'enrolled',
      'completed',
      'dropped'
    ].includes(req.body.status),
    'Invalid enrollment status'
  );

  const result = await transaction(async db => {
    const found = await db.query(`
      ${enrollmentSQL}
      WHERE e.enrollment_id=$1
      FOR UPDATE OF e
    `, [id(req.params.id)]);

    check(
      found.rowCount,
      'Enrollment not found',
      404
    );

    const old = found.rows[0];

    const published = await db.query(
      'SELECT 1 FROM course_result WHERE enrollment_id=$1',
      [old.enrollment_id]
    );

    check(
      !published.rowCount,
      'The result for this enrollment is published; its status is final',
      409
    );

    check(
      !(
        old.fee_required &&
        old.payment_status !== 'paid' &&
        ['enrolled', 'completed'].includes(req.body.status)
      ),
      'The student must pay the course fee before enrollment can be completed',
      409
    );

    check(
      !(
        old.payment_status === 'paid' &&
        req.body.status === 'pending_payment'
      ),
      'A paid course cannot be charged again',
      409
    );

    check(
      old.fee_required ||
        req.body.status !== 'pending_payment',
      'Historical enrollments are not subject to this new course fee',
      409
    );

    await db.query(
      'UPDATE enrollment SET status=$1 WHERE enrollment_id=$2',
      [req.body.status, old.enrollment_id]
    );

    await log(
      db,
      req.admin.admin_id,
      'enrollment',
      old.enrollment_id,
      'UPDATE',
      `Status changed to ${req.body.status}`
    );

    const updated = await db.query(`
      ${enrollmentSQL}
      WHERE e.enrollment_id=$1
    `, [old.enrollment_id]);

    return updated.rows[0];
  });

  res.json(result);
}));

module.exports = router;