const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap, check, id, text, transaction
} = require('../lib/common');

const { profile } = require('../lib/accounts');
const { parseRows, roster, saveRows } = require('../lib/marks');
const { MARK_COMPONENTS, RETAKE_COMPONENT } = require('../lib/grading');
const teaching = require('../lib/teaching');

router.use(auth, auth.requireFaculty);

// Marks may be entered only for a course assigned to this teacher.
async function assignedCourse(db, req, write = false) {
  const r = await db.query(`
    SELECT
      c.*,
      d.department_code,
      d.department_name,
      faculty_teaches(c.course_id,$2) AS is_mine,
      EXISTS (
        SELECT 1 FROM result_publication p
        WHERE p.department_id=c.department_id
          AND p.level=c.level
          AND p.term=c.term
      ) AS term_published
    FROM course c
    JOIN department d ON d.department_id=c.department_id
    WHERE c.course_id=$1
    ${write ? 'FOR SHARE OF c' : ''}
  `, [
    id(req.params.id, 'course'),
    req.user.faculty_id
  ]);

  check(r.rowCount, 'Course not found', 404);

  check(
    r.rows[0].is_mine,
    'You can enter marks only for courses assigned to you',
    403
  );

  check(
    !write || r.rows[0].active,
    'This course is inactive',
    409
  );

  return r.rows[0];
}

router.get('/dashboard', wrap(async (req, res) => {
  const facultyId = req.user.faculty_id;

  const [person, courses, students] = await Promise.all([
    profile(pool, 'faculty', facultyId),

    pool.query(`
      SELECT
        c.*,
        d.department_code,
        faculty_teaches(c.course_id,$1) AS is_mine,
        ct.faculty_id AS assigned_faculty_id,
        f.full_name AS assigned_faculty_name,
        n.student_count,
        n.retake_count,
        n.marked_count
      FROM course c
      JOIN department d ON d.department_id=c.department_id
      LEFT JOIN course_teacher ct
        ON ct.course_id=c.course_id
       AND ct.released_at IS NULL
      LEFT JOIN faculty_public f ON f.faculty_id=ct.faculty_id
      -- Current teaching cycle: paid students not yet published.
      CROSS JOIN LATERAL (
        SELECT
          count(*)::int AS student_count,
          count(*) FILTER (WHERE e.is_retake)::int AS retake_count,
          count(*) FILTER (
            WHERE CASE WHEN e.is_retake
              THEN m.${RETAKE_COMPONENT} IS NOT NULL
              ELSE m.total IS NOT NULL
            END
          )::int AS marked_count
        FROM enrollment e
        LEFT JOIN course_mark m ON m.enrollment_id=e.enrollment_id
        LEFT JOIN course_result cr ON cr.enrollment_id=e.enrollment_id
        WHERE e.course_id=c.course_id
          AND e.status IN ('enrolled','completed')
          AND cr.enrollment_id IS NULL
      ) n
      WHERE faculty_teaches(c.course_id,$1)
        OR (c.active=TRUE AND c.department_id=$2)
      ORDER BY c.level,c.term,c.course_code
    `, [facultyId, req.user.department_id]),

    pool.query(`
      SELECT
        s.student_id,s.registration_no,s.full_name,s.email,
        s.current_cgpa,s.current_status,
        s.current_level,s.current_term,
        s.advisor_id=$1 AS is_advisee,
        p.program_name
      FROM student s
      JOIN program p ON p.program_id=s.program_id
      WHERE s.advisor_id=$1
        OR EXISTS (
          SELECT 1
          FROM enrollment e
          WHERE e.student_id=s.student_id
            AND faculty_teaches(e.course_id,$1)
            AND e.status IN ('enrolled','completed')
        )
      ORDER BY s.registration_no
    `, [facultyId])
  ]);

  res.json({
    profile: person,
    courses: courses.rows,
    students: students.rows
  });
}));

router.put('/profile', wrap(async (req, res) => {
  await transaction(async db => {
    await db.query(
      'UPDATE users SET phone=$1 WHERE user_id=$2',
      [
        text(req.body.phone, 'phone', 20, false),
        req.user.user_id
      ]
    );

    await db.query(`
      UPDATE faculty
      SET office_location=$1,office_hours=$2
      WHERE faculty_id=$3
    `, [
      text(req.body.office_location, 'office location', 100, false),
      text(req.body.office_hours, 'office hours', 200, false),
      req.user.faculty_id
    ]);
  });

  res.json(
    await profile(pool, 'faculty', req.user.faculty_id)
  );
}));

// A teacher may take any active course of their own department that
// no other teacher holds for the current term (one teacher per
// course; lib/teaching.js and the course_teacher_one_active index).
router.post('/courses/:id', wrap(async (req, res) => {
  const courseId = id(req.params.id);

  await transaction(async db => {
    const allowed = await db.query(`
      SELECT 1
      FROM course
      WHERE course_id=$1
        AND active=TRUE
        AND department_id=$2
    `, [courseId, req.user.department_id]);

    check(
      allowed.rowCount,
      'Course is inactive or outside your department',
      409
    );

    check(
      await teaching.assign(db, courseId, req.user.faculty_id),
      'This course is already in your teaching list',
      409
    );
  });

  res.json({ message: 'Course added to your teaching list' });
}));

// Frees the course so another teacher can take it. The assignment
// is kept as history (released), as are all marks and results.
router.delete('/courses/:id', wrap(async (req, res) => {
  const courseId = id(req.params.id);

  await transaction(async db => {
    check(
      await teaching.release(db, courseId, 'removed', req.user.faculty_id),
      'You are not assigned to this course',
      403
    );
  });

  res.json({
    message: 'Teaching assignment removed. Academic records were kept.'
  });
}));

// Every enrolled (paid) student of the course with their marks.
router.get('/courses/:id/marks', wrap(async (req, res) => {
  const course = await assignedCourse(pool, req);

  res.json({
    course,
    components: MARK_COMPONENTS,
    retake_component: RETAKE_COMPONENT,
    students: await roster(pool, course.course_id)
  });
}));

// Save some or all rows; blank components stay "not entered".
router.put('/courses/:id/marks', wrap(async (req, res) => {
  const rows = parseRows(req.body.marks);

  const result = await transaction(async db => {
    const course = await assignedCourse(db, req, true);

    const saved = await saveRows(
      db,
      course.course_id,
      req.user.faculty_id,
      rows
    );

    return {
      saved,
      course,
      components: MARK_COMPONENTS,
      retake_component: RETAKE_COMPONENT,
      students: await roster(db, course.course_id)
    };
  });

  res.json(result);
}));

router.get('/students/:id/progress', wrap(async (req, res) => {
  const studentId = id(req.params.id);
  const facultyId = req.user.faculty_id;

  const s = await pool.query(`
    SELECT
      student_id,registration_no,full_name,email,current_cgpa,
      current_level,current_term,
      advisor_id=$2 AS is_advisee
    FROM student
    WHERE student_id=$1
      AND (
        advisor_id=$2
        OR EXISTS (
          SELECT 1
          FROM enrollment e
          WHERE e.student_id=$1
            AND faculty_teaches(e.course_id,$2)
            AND e.status IN ('enrolled','completed')
        )
      )
  `, [studentId, facultyId]);

  check(
    s.rowCount,
    'Student is not under your supervision',
    403
  );

  // Advisors see every course; course teachers only their own.
  const enrollments = await pool.query(`
    SELECT
      e.enrollment_id,e.academic_year,e.term,e.status,e.is_retake,
      c.course_code,c.course_title,
      m.attendance,m.class_test,m.semester_final,m.total,
      cr.letter_grade,cr.grade_point
    FROM enrollment e
    JOIN course c ON c.course_id=e.course_id
    LEFT JOIN course_mark m ON m.enrollment_id=e.enrollment_id
    LEFT JOIN course_result cr ON cr.enrollment_id=e.enrollment_id
    WHERE e.student_id=$1
      AND ($3::boolean OR faculty_teaches(c.course_id,$2))
    ORDER BY c.level,c.term,c.course_code
  `, [studentId, facultyId, s.rows[0].is_advisee]);

  res.json({
    student: s.rows[0],
    components: MARK_COMPONENTS,
    enrollments: enrollments.rows
  });
}));

module.exports = router;
