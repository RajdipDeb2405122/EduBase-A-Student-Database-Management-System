const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap, check, id, text, transaction, log
} = require('../lib/common');

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

    const year = text(req.body.academic_year, 'academic year', 20);
    const term = text(req.body.term, 'term', 20);

    const result = await transaction(async db => {
      const valid = await db.query(`
        SELECT 1
        FROM course c
        JOIN student s ON s.program_id=c.program_id
        WHERE c.course_id=$1
          AND s.student_id=$2
          AND c.active=TRUE
      `, [courseId, studentId]);

      check(
        valid.rowCount,
        'Select an active course from your program'
      );

      const e = await db.query(`
        SELECT 1 FROM enrollment
        WHERE student_id=$1
          AND course_id=$2
          AND academic_year=$3
          AND term=$4
      `, [studentId, courseId, year, term]);

      check(
        !e.rowCount,
        'Already enrolled for this year and term',
        409
      );

      return db.query(`
        INSERT INTO course_registration_requests (
          student_id,course_id,academic_year,term
        )
        VALUES($1,$2,$3,$4)
        RETURNING *
      `, [studentId, courseId, year, term]);
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
    !status || ['pending', 'approved', 'rejected'].includes(status),
    'Invalid status'
  );

  const r = await pool.query(`
    SELECT
      r.*,c.course_code,c.course_title,c.credit_hours,
      s.registration_no,s.full_name AS student_name,
      s.email AS student_email,p.program_name,
      a.full_name AS reviewed_by_name
    FROM course_registration_requests r
    JOIN course c ON c.course_id=r.course_id
    JOIN student s ON s.student_id=r.student_id
    JOIN program p ON p.program_id=s.program_id
    LEFT JOIN admin_public a ON a.admin_id=r.reviewed_by_admin_id
    WHERE ($1::text IS NULL OR r.status=$1)
    ORDER BY r.requested_on DESC
  `, [status]);

  res.json(r.rows);
});

router.get('/pending', list('pending'));
router.get('/', list(null));

router.put('/:id/approve', wrap(async (req, res) => {
  await transaction(async db => {
    const r = await db.query(`
      SELECT * FROM course_registration_requests
      WHERE request_id=$1 AND status='pending'
      FOR UPDATE
    `, [id(req.params.id)]);

    check(
      r.rowCount,
      'Request not found or already processed',
      409
    );

    const q = r.rows[0];

    const valid = await db.query(`
      SELECT 1
      FROM student s
      JOIN users u ON u.user_id=s.user_id
      JOIN course c ON c.program_id=s.program_id
      WHERE s.student_id=$1
        AND c.course_id=$2
        AND s.current_status='active'
        AND u.status='active'
        AND c.active=TRUE
    `, [q.student_id, q.course_id]);

    check(
      valid.rowCount,
      'Student/course is inactive or program does not match'
    );

    const e = await db.query(`
      INSERT INTO enrollment (
        student_id,course_id,academic_year,term,
        authorized_by_admin_id
      )
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(student_id,course_id,academic_year,term)
      DO NOTHING
      RETURNING enrollment_id
    `, [
      q.student_id,
      q.course_id,
      q.academic_year,
      q.term,
      req.admin.admin_id
    ]);

    check(
      e.rowCount,
      'Student is already enrolled; reject this stale request instead',
      409
    );

    await db.query(`
      UPDATE course_registration_requests
      SET status='approved',
          reviewed_by_admin_id=$1,
          reviewed_on=CURRENT_TIMESTAMP
      WHERE request_id=$2
    `, [req.admin.admin_id, q.request_id]);

    await log(
      db,
      req.admin.admin_id,
      'enrollment',
      e.rows[0].enrollment_id,
      'AUTHORIZE',
      'Approved course registration'
    );
  });

  res.json({ message: 'Course registration approved' });
}));

router.put('/:id/reject', wrap(async (req, res) => {
  await transaction(async db => {
    const r = await db.query(`
      UPDATE course_registration_requests
      SET status='rejected',
          reviewed_by_admin_id=$1,
          reviewed_on=CURRENT_TIMESTAMP,
          rejection_reason=$2
      WHERE request_id=$3 AND status='pending'
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
      r.rowCount,
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

  res.json({ message: 'Course registration rejected' });
}));

module.exports = router;