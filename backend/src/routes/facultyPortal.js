const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap, check, id, text, transaction
} = require('../lib/common');

const { profile } = require('../lib/accounts');
const { parseRows, roster, saveRows } = require('../lib/marks');
const { MARK_COMPONENTS } = require('../lib/grading');

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
        (
          SELECT count(*)::int
          FROM course_teacher ct
          WHERE ct.course_id=c.course_id
        ) AS teacher_count,
        (
          SELECT count(*)::int
          FROM enrollment e
          WHERE e.course_id=c.course_id
            AND e.status IN ('enrolled','completed')
        ) AS student_count,
        (
          SELECT count(*)::int
          FROM enrollment e
          JOIN course_mark m ON m.enrollment_id=e.enrollment_id
          WHERE e.course_id=c.course_id
            AND e.status IN ('enrolled','completed')
            AND m.total IS NOT NULL
        ) AS marked_count
      FROM course c
      JOIN department d ON d.department_id=c.department_id
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

// Any teacher may add any active course of their own department,
// even when other teachers already teach it.
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

    const r = await db.query(`
      INSERT INTO course_teacher (course_id,faculty_id)
      VALUES ($1,$2)
      ON CONFLICT (course_id,faculty_id) DO NOTHING
      RETURNING course_id
    `, [courseId, req.user.faculty_id]);

    check(
      r.rowCount,
      'This course is already in your teaching list',
      409
    );
  });

  res.json({ message: 'Course added to your teaching list' });
}));

router.delete('/courses/:id', wrap(async (req, res) => {
  const courseId = id(req.params.id);
  const facultyId = req.user.faculty_id;

  await transaction(async db => {
    const r = await db.query(`
      DELETE FROM course_teacher
      WHERE course_id=$1 AND faculty_id=$2
      RETURNING course_id
    `, [courseId, facultyId]);

    if (!r.rowCount) {
      // Legacy assignment recorded only on course.faculty_id.
      const legacy = await db.query(`
        UPDATE course SET faculty_id=NULL
        WHERE course_id=$1 AND faculty_id=$2
        RETURNING course_id
      `, [courseId, facultyId]);

      check(
        legacy.rowCount,
        'You are not assigned to this course',
        403
      );
    }
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
      e.enrollment_id,e.academic_year,e.term,e.status,
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
