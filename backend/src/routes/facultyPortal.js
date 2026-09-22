const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap, check, id, text, transaction
} = require('../lib/common');

const { profile } = require('../lib/accounts');
const {
  definition, saveResult, ensureExamPublishTables
} = require('../lib/exams');

router.use(auth, auth.requireFaculty);

async function ownedExam(db, req, write = false) {
  const r = await db.query(`
    SELECT x.*,faculty_teaches(c.course_id,$2) AND c.active AS can_edit
    FROM exam x
    JOIN course c ON c.course_id=x.course_id
    WHERE x.exam_id=$1 AND x.faculty_id=$2
    ${write ? 'FOR UPDATE OF x FOR SHARE OF c' : ''}
  `, [
    id(req.params.examId, 'exam'),
    req.user.faculty_id
  ]);

  check(r.rowCount, 'Exam not found', 404);

  check(
    !write || r.rows[0].can_edit,
    'You are no longer assigned to this active course',
    403
  );

  return r.rows[0];
}

router.get('/dashboard', wrap(async (req, res) => {
  const facultyId = req.user.faculty_id;

  const [person, courses, students, exams] = await Promise.all([
    profile(pool, 'faculty', facultyId),

    pool.query(`
      SELECT
        c.*,
        p.program_name,
        faculty_teaches(c.course_id,$1) AS is_mine,
        (
          SELECT count(*)::int
          FROM course_teacher ct
          WHERE ct.course_id=c.course_id
        ) AS teacher_count
      FROM course c
      JOIN program p ON p.program_id=c.program_id
      WHERE faculty_teaches(c.course_id,$1)
        OR (c.active=TRUE AND p.department_id=$2)
      ORDER BY c.course_code
    `, [facultyId, req.user.department_id]),

    pool.query(`
      SELECT
        s.student_id,s.registration_no,s.full_name,s.email,
        s.current_cgpa,s.current_status,
        s.advisor_id=$1 AS is_advisee,
        p.program_name
      FROM student s
      JOIN program p ON p.program_id=s.program_id
      WHERE s.advisor_id=$1
        OR EXISTS (
          SELECT 1
          FROM enrollment e
          JOIN course c ON c.course_id=e.course_id
          WHERE e.student_id=s.student_id
            AND faculty_teaches(c.course_id,$1)
            AND e.status IN ('enrolled','completed')
        )
      ORDER BY s.registration_no
    `, [facultyId]),

    pool.query(`
      SELECT
        x.*,c.course_code,c.course_title,
        faculty_teaches(c.course_id,$1) AND c.active AS can_edit,
        (
          SELECT count(*)::int
          FROM exam_result r
          WHERE r.exam_id=x.exam_id
        ) AS student_count,
        (
          SELECT count(*)::int
          FROM exam_result r
          WHERE r.exam_id=x.exam_id
            AND r.obtained_marks IS NOT NULL
        ) AS graded_count
      FROM exam x
      JOIN course c ON c.course_id=x.course_id
      WHERE x.faculty_id=$1
      ORDER BY x.exam_date DESC NULLS LAST,x.exam_id DESC
    `, [facultyId])
  ]);

  res.json({
    profile: person,
    courses: courses.rows,
    students: students.rows,
    exams: exams.rows
  });
}));

// The faculty member's own exam-level publication requests
// and the admin's decisions on them (no per-student rows).
router.get('/publish-requests', wrap(async (req, res) => {
  await ensureExamPublishTables();

  const result = await pool.query(`
    SELECT
      r.request_id,
      r.exam_id,
      r.faculty_id,
      r.status,
      r.requested_on,
      r.reviewed_by_admin_id,
      r.reviewed_on,
      x.exam_type,
      x.exam_date,
      x.academic_year,
      x.term,
      x.published,
      c.course_code,
      c.course_title,
      (
        SELECT count(*)::int
        FROM exam_result er
        WHERE er.exam_id=r.exam_id
          AND er.obtained_marks IS NOT NULL
      ) AS graded_count,
      (
        SELECT count(*)::int
        FROM exam_result er
        WHERE er.exam_id=r.exam_id
      ) AS student_count

    FROM exam_publish_requests r

    JOIN exam x
      ON x.exam_id=r.exam_id

    JOIN course c
      ON c.course_id=x.course_id

    WHERE r.faculty_id=$1

    ORDER BY (r.status='pending') DESC, r.requested_on DESC
  `, [req.user.faculty_id]);

  res.json(result.rows);
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

  const allowed = await pool.query(`
    SELECT 1
    FROM course c
    JOIN program p ON p.program_id=c.program_id
    WHERE c.course_id=$1
      AND c.active=TRUE
      AND p.department_id=$2
  `, [courseId, req.user.department_id]);

  check(
    allowed.rowCount,
    'Course is inactive or outside your department',
    409
  );

  const r = await pool.query(`
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

  res.json({ message: 'Course added to your teaching list' });
}));

router.delete('/courses/:id', wrap(async (req, res) => {
  const courseId = id(req.params.id);
  const facultyId = req.user.faculty_id;

  const r = await pool.query(`
    DELETE FROM course_teacher
    WHERE course_id=$1 AND faculty_id=$2
    RETURNING course_id
  `, [courseId, facultyId]);

  if (!r.rowCount) {
    // Legacy assignment recorded only on course.faculty_id.
    const legacy = await pool.query(`
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

  res.json({
    message: 'Teaching assignment removed. Academic records were kept.'
  });
}));

router.get('/students/:id/progress', wrap(async (req, res) => {
  await ensureExamPublishTables();

  const studentId = id(req.params.id);
  const facultyId = req.user.faculty_id;

  const s = await pool.query(`
    SELECT
      student_id,registration_no,full_name,email,current_cgpa,
      advisor_id=$2 AS is_advisee
    FROM student
    WHERE student_id=$1
      AND (
        advisor_id=$2
        OR EXISTS (
          SELECT 1
          FROM enrollment e
          JOIN course c ON c.course_id=e.course_id
          WHERE e.student_id=$1
            AND faculty_teaches(c.course_id,$2)
            AND e.status IN ('enrolled','completed')
        )
      )
  `, [studentId, facultyId]);

  check(
    s.rowCount,
    'Student is not under your supervision',
    403
  );

  const advisor = s.rows[0].is_advisee;

  const [enrollments, results] = await Promise.all([
    pool.query(`
      SELECT e.*,c.course_code,c.course_title
      FROM enrollment e
      JOIN course c ON c.course_id=e.course_id
      WHERE e.student_id=$1
        AND ($3::boolean OR faculty_teaches(c.course_id,$2))
      ORDER BY e.academic_year DESC,e.term
    `, [studentId, facultyId, advisor]),

    pool.query(`
      SELECT
        x.exam_id,x.exam_type,x.exam_date,x.total_marks,
        x.academic_year,x.term,
        r.obtained_marks,r.grade,r.remarks,
        c.course_code,c.course_title
      FROM exam_result r
      JOIN exam x ON x.exam_id=r.exam_id
      JOIN course c ON c.course_id=x.course_id
      WHERE r.student_id=$1
        AND ($3::boolean OR faculty_teaches(c.course_id,$2))
        AND (x.published=TRUE OR x.faculty_id=$2)
      ORDER BY x.exam_date DESC NULLS LAST
    `, [studentId, facultyId, advisor])
  ]);

  res.json({
    student: s.rows[0],
    enrollments: enrollments.rows,
    results: results.rows
  });
}));

router.post('/exams', wrap(async (req, res) => {
  const d = definition(req.body);

  const result = await transaction(async db => {
    const c = await db.query(`
      SELECT * FROM course
      WHERE course_id=$1
        AND faculty_teaches(course_id,$2)
        AND active=TRUE
      FOR SHARE
    `, [
      id(req.body.course_id, 'course'),
      req.user.faculty_id
    ]);

    check(
      c.rowCount,
      'You may create exams only for your assigned active courses',
      403
    );

    const x = await db.query(`
      INSERT INTO exam (
        course_id,faculty_id,academic_year,term,
        exam_type,exam_date,total_marks
      )
      VALUES($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [
      c.rows[0].course_id,
      req.user.faculty_id,
      d.academic_year,
      d.term,
      d.exam_type,
      d.exam_date,
      d.total_marks
    ]);

    // One shared exam, one result slot per eligible enrolled student.
    await db.query(`
      INSERT INTO exam_result(exam_id,student_id,enrollment_id)
      SELECT $1,student_id,enrollment_id
      FROM enrollment
      WHERE course_id=$2
        AND academic_year=$3
        AND term=$4
        AND status IN ('enrolled','completed')
    `, [
      x.rows[0].exam_id,
      c.rows[0].course_id,
      d.academic_year,
      d.term
    ]);

    return x.rows[0];
  });

  res.status(201).json(result);
}));

router.get('/exams/:examId/roster', wrap(async (req, res) => {
  const x = await ownedExam(pool, req);

  const r = await pool.query(`
    SELECT
      e.enrollment_id,e.status,
      s.student_id,s.registration_no,s.full_name,
      r.obtained_marks,r.grade,r.remarks
    FROM enrollment e
    JOIN student s ON s.student_id=e.student_id
    LEFT JOIN exam_result r
      ON r.enrollment_id=e.enrollment_id AND r.exam_id=$1
    WHERE e.course_id=$2
      AND e.academic_year=$3
      AND e.term=$4
      AND (
        e.status IN ('enrolled','completed')
        OR r.result_id IS NOT NULL
      )
    ORDER BY s.registration_no
  `, [x.exam_id, x.course_id, x.academic_year, x.term]);

  res.json({ exam: x, students: r.rows });
}));

router.put(
  '/exams/:examId/results/:enrollmentId',
  wrap(async (req, res) => {
    const result = await transaction(async db => {
      const x = await ownedExam(db, req, true);

      return saveResult(
        db,
        x,
        id(req.params.enrollmentId),
        req.body,
        true
      );
    });

    res.json(result);
  })
);

// Faculty cannot publish results directly. One request covers
// the ENTIRE exam: after the administrator accepts it, every
// student's result for this exam is published together.
router.post(
  '/exams/:examId/publish-requests',
  wrap(async (req, res) => {
    await ensureExamPublishTables();

    const request = await transaction(async db => {
      const x = await ownedExam(db, req, true);

      check(
        !x.published,
        'Results for this exam are already published',
        409
      );

      const existing = await db.query(`
        SELECT status
        FROM exam_publish_requests
        WHERE exam_id=$1
          AND status IN ('pending', 'approved')
      `, [x.exam_id]);

      check(
        !existing.rowCount,

        existing.rows[0]?.status === 'approved'
          ? 'This exam has already been approved for publication'
          : 'A publish request for this exam is already awaiting review',

        409
      );

      const created = await db.query(`
        INSERT INTO exam_publish_requests
          (exam_id, faculty_id)
        VALUES ($1, $2)
        RETURNING *
      `, [x.exam_id, req.user.faculty_id]);

      return created.rows[0];
    });

    res.status(201).json({
      message: 'Publish request sent to the administrator',
      request
    });
  })
);

router.delete('/exams/:examId', wrap(async (req, res) => {
  await transaction(async db => {
    const x = await ownedExam(db, req, true);

    const scored = await db.query(`
      SELECT 1 FROM exam_result
      WHERE exam_id=$1 AND obtained_marks IS NOT NULL
      LIMIT 1
    `, [x.exam_id]);

    check(
      !x.published && !scored.rowCount,
      'Only unpublished exams without recorded marks may be deleted',
      409
    );

    await db.query(
      'DELETE FROM exam WHERE exam_id=$1',
      [x.exam_id]
    );
  });

  res.json({ message: 'Draft exam deleted' });
}));

module.exports = router;