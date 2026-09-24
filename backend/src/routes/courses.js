const router = require('express').Router();
const pool = require('../config/database');

const {
  wrap,
  check,
  id,
  text,
  number,
  transaction,
  log
} = require('../lib/common');

const academic = require('../lib/academic');

const courseSQL = `
  SELECT
    c.*,
    d.department_code,
    d.department_name,
    f.full_name AS faculty_name,
    (
      SELECT count(*)::int
      FROM enrollment e
      WHERE e.course_id=c.course_id
    ) AS enrollment_count
  FROM course c
  JOIN department d ON d.department_id=c.department_id
  LEFT JOIN faculty_public f ON f.faculty_id=c.faculty_id
`;

const COURSE_TYPES = ['Core', 'Elective', 'Project', 'Lab'];

async function fields(db, body) {
  const courseCode = text(body.course_code, 'course code', 20)
    .toUpperCase()
    .replace(/\s+/g, ' ');

  check(
    /^[A-Z]{2,5} [0-9]{3}$/.test(courseCode),
    'Course code must look like "CSE 101"'
  );

  const departmentId = id(body.department_id, 'department');

  const d = await db.query(
    'SELECT 1 FROM department WHERE department_id=$1',
    [departmentId]
  );

  check(d.rowCount, 'Department not found');

  const facultyId = id(body.faculty_id, 'instructor', true);

  if (facultyId) {
    const f = await db.query(`
      SELECT 1 FROM faculty_public
      WHERE faculty_id=$1 AND status='active'
    `, [facultyId]);

    check(f.rowCount, 'Select an active instructor');
  }

  const courseType = body.course_type || 'Core';

  check(COURSE_TYPES.includes(courseType), 'Invalid course type');

  return {
    department_id: departmentId,
    faculty_id: facultyId,
    course_code: courseCode,
    course_title: text(body.course_title, 'course title', 200),
    credit_hours: number(body.credit_hours, 'credit hours', 0.25, 12),
    level: academic.level(body.level),
    term: academic.term(body.term),
    course_type: courseType,
    active: body.active !== false
  };
}

// Keeps course_teacher in step with the admin-chosen instructor.
async function assignInstructor(db, courseId, facultyId) {
  if (facultyId) {
    await db.query(`
      INSERT INTO course_teacher (course_id,faculty_id)
      VALUES ($1,$2)
      ON CONFLICT DO NOTHING
    `, [courseId, facultyId]);
  }
}

router.get('/', wrap(async (req, res) => {
  const result = await pool.query(`
    ${courseSQL}
    WHERE ($1::int IS NULL OR c.department_id=$1)
      AND ($2::int IS NULL OR c.level=$2)
      AND ($3::int IS NULL OR c.term=$3)
      AND ($4::boolean IS NULL OR c.active=$4)
    ORDER BY d.department_code,c.level,c.term,c.course_code
  `, [
    id(req.query.department_id, 'department', true),
    req.query.level ? academic.level(req.query.level) : null,
    req.query.term ? academic.term(req.query.term) : null,
    req.query.active === undefined ? null : req.query.active === 'true'
  ]);

  res.json(result.rows);
}));

router.get('/:id', wrap(async (req, res) => {
  const result = await pool.query(`
    ${courseSQL}
    WHERE c.course_id=$1
  `, [id(req.params.id)]);

  check(result.rowCount, 'Course not found', 404);
  res.json(result.rows[0]);
}));

router.post('/', wrap(async (req, res) => {
  const course = await transaction(async db => {
    const c = await fields(db, req.body);

    const r = await db.query(`
      INSERT INTO course (
        department_id,faculty_id,course_code,course_title,
        credit_hours,level,term,course_type,active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING course_id
    `, [
      c.department_id, c.faculty_id, c.course_code, c.course_title,
      c.credit_hours, c.level, c.term, c.course_type, c.active
    ]);

    const courseId = r.rows[0].course_id;

    await assignInstructor(db, courseId, c.faculty_id);

    await log(
      db, req.admin.admin_id, 'course', courseId, 'CREATE',
      `Created course: ${c.course_code} - ${c.course_title}`
    );

    return (await db.query(
      `${courseSQL} WHERE c.course_id=$1`,
      [courseId]
    )).rows[0];
  });

  res.status(201).json(course);
}));

router.put('/:id', wrap(async (req, res) => {
  const courseId = id(req.params.id);

  const course = await transaction(async db => {
    const old = await db.query(
      'SELECT * FROM course WHERE course_id=$1 FOR UPDATE',
      [courseId]
    );

    check(old.rowCount, 'Course not found', 404);

    const c = await fields(db, req.body);
    const before = old.rows[0];

    // Moving a course with students would corrupt their term
    // registration and results.
    const used = await db.query(
      'SELECT 1 FROM enrollment WHERE course_id=$1 LIMIT 1',
      [courseId]
    );

    check(
      !used.rowCount || (
        c.department_id === before.department_id &&
        c.level === before.level &&
        c.term === before.term &&
        c.course_code === before.course_code &&
        Number(c.credit_hours) === Number(before.credit_hours)
      ),
      'This course has enrollments: its department, level, term, code and credits cannot change',
      409
    );

    await db.query(`
      UPDATE course
      SET department_id=$1,
          faculty_id=$2,
          course_code=$3,
          course_title=$4,
          credit_hours=$5,
          level=$6,
          term=$7,
          course_type=$8,
          active=$9
      WHERE course_id=$10
    `, [
      c.department_id, c.faculty_id, c.course_code, c.course_title,
      c.credit_hours, c.level, c.term, c.course_type, c.active,
      courseId
    ]);

    // Replacing the instructor also removes the previous one's
    // marks-entry access to this course.
    if (before.faculty_id && before.faculty_id !== c.faculty_id) {
      await db.query(`
        DELETE FROM course_teacher
        WHERE course_id=$1 AND faculty_id=$2
      `, [courseId, before.faculty_id]);
    }

    await assignInstructor(db, courseId, c.faculty_id);

    await log(
      db, req.admin.admin_id, 'course', courseId, 'UPDATE',
      `Updated course: ${c.course_code}`
    );

    return (await db.query(
      `${courseSQL} WHERE c.course_id=$1`,
      [courseId]
    )).rows[0];
  });

  res.json(course);
}));

router.delete('/:id', wrap(async (req, res) => {
  await transaction(async db => {
    const r = await db.query(
      'SELECT * FROM course WHERE course_id=$1 FOR UPDATE',
      [id(req.params.id)]
    );

    check(r.rowCount, 'Course not found', 404);

    const used = await db.query(
      'SELECT 1 FROM enrollment WHERE course_id=$1 LIMIT 1',
      [r.rows[0].course_id]
    );

    check(
      !used.rowCount,
      'This course has enrollments. Mark it inactive instead of deleting it.',
      409
    );

    await db.query(
      'DELETE FROM course WHERE course_id=$1',
      [r.rows[0].course_id]
    );

    await log(
      db, req.admin.admin_id, 'course', r.rows[0].course_id, 'DELETE',
      `Deleted course: ${r.rows[0].course_code}`
    );
  });

  res.json({ message: 'Course deleted successfully' });
}));

module.exports = router;
