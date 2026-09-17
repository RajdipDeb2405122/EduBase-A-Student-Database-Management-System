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
  enrollmentSQL,
  createPendingEnrollment
} = require('../lib/courseFees');

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

router.post('/', wrap(async (req, res) => {
  const allowed = [
    'student_id',
    'course_id',
    'academic_year',
    'term',
    'enrolled_on'
  ];

  check(
    Object.keys(req.body).every(
      key => allowed.includes(key)
    ),
    'Do not supply status or payment fields'
  );

  const result = await transaction(async db => {
    const enrollment = await createPendingEnrollment(
      db,
      req.body,
      req.admin.admin_id
    );

    await log(
      db,
      req.admin.admin_id,
      'enrollment',
      enrollment.enrollment_id,
      'AUTHORIZE',
      'Course authorized; awaiting student course-fee payment'
    );

    const record = await db.query(`
      ${enrollmentSQL}
      WHERE e.enrollment_id=$1
    `, [enrollment.enrollment_id]);

    return record.rows[0];
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

router.delete('/:id', wrap(async (req, res) => {
  await transaction(async db => {
    const found = await db.query(`
      SELECT *
      FROM enrollment
      WHERE enrollment_id=$1
      FOR UPDATE
    `, [id(req.params.id)]);

    check(
      found.rowCount,
      'Enrollment not found',
      404
    );

    const old = found.rows[0];

    const used = await db.query(`
      SELECT 1
      FROM course_payment
      WHERE enrollment_id=$1

      UNION ALL

      SELECT 1
      FROM exam_result
      WHERE enrollment_id=$1
    `, [old.enrollment_id]);

    check(
      !used.rowCount,
      'Enrollments with payments or exam results cannot be deleted. Use an appropriate status instead.',
      409
    );

    const approved = await db.query(`
      SELECT 1
      FROM course_registration_requests
      WHERE student_id=$1
        AND course_id=$2
        AND academic_year=$3
        AND term=$4
        AND status='approved'
    `, [
      old.student_id,
      old.course_id,
      old.academic_year,
      old.term
    ]);

    check(
      !approved.rowCount,
      'An approved course request must be retained. Set the enrollment to dropped instead.',
      409
    );

    await db.query(
      'DELETE FROM enrollment WHERE enrollment_id=$1',
      [old.enrollment_id]
    );

    await log(
      db,
      req.admin.admin_id,
      'enrollment',
      old.enrollment_id,
      'DELETE',
      'Deleted unused enrollment authorization'
    );
  });

  res.json({
    message: 'Enrollment deleted'
  });
}));

module.exports = router;