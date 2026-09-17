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
  createPendingEnrollment
} = require('../lib/courseFees');

router.use(auth);

router.post(
  '/request',
  auth.requireStudent,
  wrap(async (req, res) => {
    const studentId = req.user.student_id;
    const courseId = id(req.body.course_id, 'course');

    check(
      req.body.student_id == null ||
        id(req.body.student_id) === studentId,
      'You cannot request for another student',
      403
    );

    const year = text(
      req.body.academic_year,
      'academic year',
      20
    );

    const term = text(req.body.term, 'term', 20);

    const result = await transaction(async db => {
      const valid = await db.query(`
        SELECT 1
        FROM course c

        JOIN student s
          ON s.program_id=c.program_id

        WHERE c.course_id=$1
          AND s.student_id=$2
          AND c.active=TRUE
      `, [courseId, studentId]);

      check(
        valid.rowCount,
        'Select an active course from your program'
      );

      const existing = await db.query(`
        SELECT 1
        FROM enrollment
        WHERE student_id=$1
          AND course_id=$2
          AND academic_year=$3
          AND term=$4
      `, [
        studentId,
        courseId,
        year,
        term
      ]);

      check(
        !existing.rowCount,
        'An approval/enrollment already exists for this course, year and term',
        409
      );

      return db.query(`
        INSERT INTO course_registration_requests (
          student_id,
          course_id,
          academic_year,
          term
        )
        VALUES($1,$2,$3,$4)
        RETURNING *
      `, [
        studentId,
        courseId,
        year,
        term
      ]);
    });

    res.status(201).json({
      message: 'Course registration requested',
      request: result.rows[0]
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
    SELECT
      r.*,
      c.course_code,
      c.course_title,
      c.credit_hours,
      s.registration_no,
      s.full_name AS student_name,
      s.email AS student_email,
      p.program_name,
      a.full_name AS reviewed_by_name,

      e.enrollment_id,
      e.status AS enrollment_status,
      e.fee_required,

      cp.course_payment_id,
      cp.receipt_no

    FROM course_registration_requests r

    JOIN course c
      ON c.course_id=r.course_id

    JOIN student s
      ON s.student_id=r.student_id

    JOIN program p
      ON p.program_id=s.program_id

    LEFT JOIN admin_public a
      ON a.admin_id=r.reviewed_by_admin_id

    LEFT JOIN enrollment e
      ON e.student_id=r.student_id
     AND e.course_id=r.course_id
     AND e.academic_year=r.academic_year
     AND e.term=r.term

    LEFT JOIN course_payment cp
      ON cp.enrollment_id=e.enrollment_id

    WHERE ($1::text IS NULL OR r.status=$1)

    ORDER BY r.requested_on DESC
  `, [status]);

  res.json(result.rows);
});

router.get('/pending', list('pending'));
router.get('/', list(null));

router.put('/:id/approve', wrap(async (req, res) => {
  await transaction(async db => {
    const result = await db.query(`
      SELECT *
      FROM course_registration_requests
      WHERE request_id=$1
        AND status='pending'
      FOR UPDATE
    `, [id(req.params.id)]);

    check(
      result.rowCount,
      'Request not found or already processed',
      409
    );

    const request = result.rows[0];

    const enrollment = await createPendingEnrollment(
      db,
      request,
      req.admin.admin_id
    );

    await db.query(`
      UPDATE course_registration_requests
      SET status='approved',
          reviewed_by_admin_id=$1,
          reviewed_on=CURRENT_TIMESTAMP
      WHERE request_id=$2
    `, [
      req.admin.admin_id,
      request.request_id
    ]);

    await log(
      db,
      req.admin.admin_id,
      'enrollment',
      enrollment.enrollment_id,
      'AUTHORIZE',
      'Approved course registration; awaiting student payment'
    );
  });

  res.json({
    message:
      'Course approved. The student must pay the ৳1000 demo course fee to complete enrollment.'
  });
}));

router.put('/:id/reject', wrap(async (req, res) => {
  await transaction(async db => {
    const result = await db.query(`
      UPDATE course_registration_requests
      SET status='rejected',
          reviewed_by_admin_id=$1,
          reviewed_on=CURRENT_TIMESTAMP,
          rejection_reason=$2
      WHERE request_id=$3
        AND status='pending'
      RETURNING request_id
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
      'Request not found or already processed',
      409
    );

    await log(
      db,
      req.admin.admin_id,
      'course_registration_requests',
      id(req.params.id),
      'REJECT',
      'Rejected course registration'
    );
  });

  res.json({
    message: 'Course registration rejected'
  });
}));

module.exports = router;