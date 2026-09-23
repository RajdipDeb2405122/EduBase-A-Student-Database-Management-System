const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap,
  check,
  id,
  transaction
} = require('../lib/common');

const { login } = require('../lib/login');
const { register } = require('../lib/registration');

const {
  enrollmentSQL,
  listPayments
} = require('../lib/courseFees');

const {
  PREDEFINED_SCHOLARSHIPS,
  ensureScholarshipTables,
  predefinedScholarship
} = require('../lib/scholarships');

router.post('/register', register('student'));
router.post('/login', wrap(login('student')));

router.use(auth, auth.requireStudent);

router.use((req, res, next) => {
  const match = /^\/(?:me|courses)\/(\d+)(?:\/|$)/.exec(
    req.path
  );

  if (
    !match ||
    Number(match[1]) !== req.user.student_id
  ) {
    return res.status(403).json({
      error: 'You may access only your own student records'
    });
  }

  next();
});

router.get('/me/:id', wrap(async (req, res) => {
  const result = await pool.query(`
    SELECT
      s.*,
      u.username,
      u.last_login,
      compute_cgpa(s.student_id) AS computed_cgpa,
      p.program_name,
      p.degree_level,
      d.department_name,
      f.full_name AS advisor_name,
      f.email AS advisor_email

    FROM student s

    JOIN users u
      ON u.user_id=s.user_id

    LEFT JOIN program p
      ON p.program_id=s.program_id

    LEFT JOIN department d
      ON d.department_id=p.department_id

    LEFT JOIN faculty_public f
      ON f.faculty_id=s.advisor_id

    WHERE s.student_id=$1
  `, [req.user.student_id]);

  res.json(result.rows[0]);
}));

const queries = {
  enrollments: `
    ${enrollmentSQL}
    WHERE e.student_id=$1
    ORDER BY e.academic_year DESC,e.term
  `,

  'course-requests': `
    SELECT
      r.*,
      c.course_code,
      c.course_title,
      c.credit_hours,
      a.full_name AS reviewed_by_name,
      e.enrollment_id,
      e.status AS enrollment_status,
      e.fee_required,
      cp.course_payment_id,
      cp.receipt_no

    FROM course_registration_requests r

    JOIN course c
      ON c.course_id=r.course_id

    LEFT JOIN admin_public a
      ON a.admin_id=r.reviewed_by_admin_id

    LEFT JOIN enrollment e
      ON e.student_id=r.student_id
     AND e.course_id=r.course_id
     AND e.academic_year=r.academic_year
     AND e.term=r.term

    LEFT JOIN course_payment cp
      ON cp.enrollment_id=e.enrollment_id

    WHERE r.student_id=$1
    ORDER BY r.requested_on DESC
  `,

  exams: `
    SELECT
      x.*,
      r.result_id,
      r.obtained_marks,
      r.grade,
      r.remarks,
      c.course_code,
      c.course_title

    FROM exam_result r

    JOIN exam x
      ON x.exam_id=r.exam_id

    JOIN course c
      ON c.course_id=x.course_id

    WHERE r.student_id=$1
      AND x.published=TRUE

    ORDER BY x.exam_date DESC NULLS LAST,x.exam_id DESC
  `,

  scholarships: `
    SELECT *
    FROM scholarship
    WHERE student_id=$1
    ORDER BY awarded_on DESC
  `
};

router.get(
  '/me/:id/payments',
  wrap(async (req, res) => {
    res.json(
      await listPayments(pool, {
        studentId: req.user.student_id
      })
    );
  })
);

for (const [name, sql] of Object.entries(queries)) {
  router.get(
    `/me/:id/${name}`,
    wrap(async (req, res) => {
      const result = await pool.query(
        sql,
        [req.user.student_id]
      );

      res.json(result.rows);
    })
  );
}

// The 10 fixed scholarships a student may choose from.
// Names and amounts come from the server and cannot be edited.
router.get('/me/:id/scholarship-options', (req, res) => {
  res.json(PREDEFINED_SCHOLARSHIPS);
});

// Applications submitted by this student.
router.get(
  '/me/:id/scholarship-applications',
  wrap(async (req, res) => {
    await ensureScholarshipTables();

    const result = await pool.query(`
      SELECT *
      FROM scholarship_application
      WHERE student_id=$1
      ORDER BY applied_on DESC
    `, [req.user.student_id]);

    res.json(result.rows);
  })
);

// Submit an application. Only the scholarship_name is accepted;
// the amount and type always come from the predefined list.
router.post(
  '/me/:id/scholarship-applications',
  wrap(async (req, res) => {
    await ensureScholarshipTables();

    const offer = predefinedScholarship(
      req.body.scholarship_name
    );

    check(offer, 'Select one of the available scholarships', 400);

    const result = await transaction(async db => {
      // Serialise concurrent applications from the same student.
      await db.query(
        'SELECT pg_advisory_xact_lock(4101, $1)',
        [req.user.student_id]
      );

      const existing = await db.query(`
        SELECT status
        FROM scholarship_application
        WHERE student_id=$1
          AND scholarship_name=$2
          AND status IN ('pending', 'approved')
      `, [req.user.student_id, offer.scholarship_name]);

      check(
        !existing.rowCount,

        existing.rows[0]?.status === 'approved'
          ? 'You have already been awarded this scholarship'
          : 'Your application for this scholarship is awaiting admin review',

        409
      );

      const inserted = await db.query(`
        INSERT INTO scholarship_application (
          student_id, scholarship_name, award_type, amount
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [
        req.user.student_id,
        offer.scholarship_name,
        offer.award_type,
        offer.amount
      ]);

      return inserted;
    });

    res.status(201).json(result.rows[0]);
  })
);

router.get('/courses/:studentId', wrap(async (req, res) => {
  const level = req.query.level
    ? id(req.query.level, 'level')
    : null;

  const term = req.query.term
    ? id(req.query.term, 'term')
    : null;

  check(
    !level || level <= 4,
    'Level must be between 1 and 4'
  );

  check(
    !term || term <= 2,
    'Term must be between 1 and 2'
  );

  const result = await pool.query(`
    SELECT c.*,p.program_name
    FROM course c

    JOIN program p
      ON p.program_id=c.program_id

    JOIN student s
      ON s.program_id=c.program_id

    WHERE s.student_id=$1
      AND c.active=TRUE
      AND (
        $2::int IS NULL
        OR c.term_no BETWEEN 2*$2-1 AND 2*$2
      )
      AND (
        $3::int IS NULL
        OR ((c.term_no-1)%2)+1=$3
      )

    ORDER BY c.course_code
  `, [
    req.user.student_id,
    level,
    term
  ]);

  res.json(result.rows);
}));

module.exports = router;