const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap,
  check,
  transaction
} = require('../lib/common');

const academic = require('../lib/academic');
const { registrationSQL } = require('../lib/termRegistration');
const { studentResult } = require('../lib/results');

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
      p.program_name,
      p.degree_level,
      d.department_name,
      d.department_code,
      f.full_name AS advisor_name,
      f.email AS advisor_email,
      (
        SELECT count(*)::int
        FROM term_result tr
        WHERE tr.student_id=s.student_id
      ) AS completed_terms

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

  registrations: `
    ${registrationSQL}
    WHERE r.student_id=$1
    ORDER BY r.requested_on DESC
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

      return db.query(`
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
    });

    res.status(201).json(result.rows[0]);
  })
);

// The only courses a student may see or register: their own
// department's current level + term.
router.get('/courses/:studentId', wrap(async (req, res) => {
  const s = await academic.standing(pool, req.user.student_id);

  const courses = await academic.termCourses(
    pool,
    s.department_id,
    s.current_level,
    s.current_term
  );

  const registration = await pool.query(`
    ${registrationSQL}
    WHERE r.student_id=$1
      AND r.level=$2
      AND r.term=$3
    ORDER BY r.requested_on DESC
    LIMIT 1
  `, [
    req.user.student_id,
    s.current_level,
    s.current_term
  ]);

  res.json({
    department_code: s.department_code,
    department_name: s.department_name,
    level: s.current_level,
    term: s.current_term,
    required: academic.COURSES_PER_TERM,
    courses,
    registration: registration.rows[0] || null
  });
}));

// Published result of one level + term, or "not published".
router.get('/me/:id/results', wrap(async (req, res) => {
  res.json(
    await studentResult(
      pool,
      await academic.standing(pool, req.user.student_id),
      academic.level(req.query.level),
      academic.term(req.query.term)
    )
  );
}));

module.exports = router;