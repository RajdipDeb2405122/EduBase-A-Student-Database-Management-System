const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');
const { wrap, check, id } = require('../lib/common');
const { login } = require('../lib/login');
const { register } = require('../lib/registration');

router.post('/register', register('student'));
router.post('/login', wrap(login('student')));

router.use(auth, auth.requireStudent);

// A URL or request body must never let a student access another student.
router.use((req, res, next) => {
  const match = /^\/(?:me|courses)\/(\d+)(?:\/|$)/.exec(req.path);

  if (!match || Number(match[1]) !== req.user.student_id) {
    return res.status(403).json({
      error: 'You may access only your own student records'
    });
  }

  next();
});

router.get('/me/:id', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT
      s.*,u.username,u.last_login,
      p.program_name,p.degree_level,d.department_name,
      f.full_name AS advisor_name,
      f.email AS advisor_email
    FROM student s
    JOIN users u ON u.user_id=s.user_id
    LEFT JOIN program p ON p.program_id=s.program_id
    LEFT JOIN department d ON d.department_id=p.department_id
    LEFT JOIN faculty_public f ON f.faculty_id=s.advisor_id
    WHERE s.student_id=$1
  `, [req.user.student_id]);

  res.json(r.rows[0]);
}));

const queries = {
  enrollments: `
    SELECT e.*,c.course_code,c.course_title,c.credit_hours
    FROM enrollment e
    JOIN course c ON c.course_id=e.course_id
    WHERE e.student_id=$1
    ORDER BY e.academic_year DESC,e.term
  `,

  'course-requests': `
    SELECT r.*,c.course_code,c.course_title,c.credit_hours,
      a.full_name AS reviewed_by_name
    FROM course_registration_requests r
    JOIN course c ON c.course_id=r.course_id
    LEFT JOIN admin_public a ON a.admin_id=r.reviewed_by_admin_id
    WHERE r.student_id=$1
    ORDER BY r.requested_on DESC
  `,

  exams: `
    SELECT
      x.*,r.result_id,r.obtained_marks,r.grade,r.remarks,
      c.course_code,c.course_title
    FROM exam_result r
    JOIN exam x ON x.exam_id=r.exam_id
    JOIN course c ON c.course_id=x.course_id
    WHERE r.student_id=$1 AND x.published=TRUE
    ORDER BY x.exam_date DESC NULLS LAST,x.exam_id DESC
  `,

  payments: `
    SELECT * FROM payment
    WHERE student_id=$1
    ORDER BY paid_on DESC
  `,

  scholarships: `
    SELECT * FROM scholarship
    WHERE student_id=$1
    ORDER BY awarded_on DESC
  `
};

for (const [name, sql] of Object.entries(queries)) {
  router.get(`/me/:id/${name}`, wrap(async (req, res) => {
    res.json(
      (await pool.query(sql, [req.user.student_id])).rows
    );
  }));
}

router.get('/courses/:studentId', wrap(async (req, res) => {
  const level = req.query.level
    ? id(req.query.level, 'level')
    : null;

  const term = req.query.term
    ? id(req.query.term, 'term')
    : null;

  check(!level || level <= 4, 'Level must be between 1 and 4');
  check(!term || term <= 2, 'Term must be 1 or 2');

  const r = await pool.query(`
    SELECT c.*,p.program_name
    FROM course c
    JOIN program p ON p.program_id=c.program_id
    JOIN student s ON s.program_id=c.program_id
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
  `, [req.user.student_id, level, term]);

  res.json(r.rows);
}));

module.exports = router;