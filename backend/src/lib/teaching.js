// Teaching assignments (course_teacher, migration 009).
//
// A course row is one offering (department + level + term), and it
// has at most ONE active teacher. Released assignments stay in the
// table as history of who taught / graded the course. The partial
// unique index course_teacher_one_active is the final guard against
// two teachers racing for the same course.

const { check } = require('./common');

// The course's active teacher, or null. Locks the course row so
// concurrent assign/release calls on it run one after another.
async function activeTeacher(db, courseId) {
  await db.query(
    'SELECT 1 FROM course WHERE course_id=$1 FOR UPDATE',
    [courseId]
  );

  const r = await db.query(`
    SELECT ct.course_teacher_id, ct.faculty_id, f.full_name
    FROM course_teacher ct
    LEFT JOIN faculty_public f ON f.faculty_id=ct.faculty_id
    WHERE ct.course_id=$1
      AND ct.released_at IS NULL
  `, [courseId]);

  return r.rows[0] || null;
}

const takenMessage = name =>
  `This course is already assigned to ${name || 'another teacher'} for this term.`;

// Assigns the course to a teacher. Assigning the current teacher
// again is a no-op; any other teacher is refused while one is active.
async function assign(db, courseId, facultyId) {
  const current = await activeTeacher(db, courseId);

  if (current) {
    check(
      current.faculty_id === facultyId,
      takenMessage(current.full_name),
      409
    );

    return false;
  }

  try {
    await db.query('SAVEPOINT assign_teacher');

    await db.query(`
      INSERT INTO course_teacher (course_id,faculty_id)
      VALUES ($1,$2)
    `, [courseId, facultyId]);

    await db.query('RELEASE SAVEPOINT assign_teacher');
  } catch (error) {
    if (
      error.code === '23505' &&
      error.constraint === 'course_teacher_one_active'
    ) {
      await db.query('ROLLBACK TO SAVEPOINT assign_teacher');
      const winner = await activeTeacher(db, courseId);
      check(false, takenMessage(winner?.full_name), 409);
    }

    throw error;
  }

  return true;
}

// Releases the active assignment (optionally only if it belongs to
// facultyId). Returns the number of assignments released (0 or 1).
async function release(db, courseId, reason, facultyId = null) {
  const r = await db.query(`
    UPDATE course_teacher
    SET released_at=CURRENT_TIMESTAMP,
        release_reason=$2
    WHERE course_id=$1
      AND released_at IS NULL
      AND ($3::int IS NULL OR faculty_id=$3)
  `, [courseId, reason, facultyId]);

  return r.rowCount;
}

// Publishing a term ends its teaching cycle: every active assignment
// of the department's level/term courses is released, plus the
// assignments of retake courses graded in this publication once they
// have no unpublished students left.
async function releaseForPublication(db, departmentId, lv, tm, retakeCourseIds = []) {
  const r = await db.query(`
    UPDATE course_teacher ct
    SET released_at=CURRENT_TIMESTAMP,
        release_reason='published'
    FROM course c
    WHERE c.course_id=ct.course_id
      AND ct.released_at IS NULL
      AND (
        (c.department_id=$1 AND c.level=$2 AND c.term=$3)
        OR (
          c.course_id = ANY($4::int[])
          AND NOT EXISTS (
            SELECT 1
            FROM enrollment e
            LEFT JOIN course_result cr ON cr.enrollment_id=e.enrollment_id
            WHERE e.course_id=c.course_id
              AND e.status IN ('pending_payment','enrolled')
              AND cr.enrollment_id IS NULL
          )
        )
      )
    RETURNING ct.course_id, ct.faculty_id
  `, [departmentId, lv, tm, retakeCourseIds]);

  return r.rows;
}

module.exports = {
  activeTeacher,
  takenMessage,
  assign,
  release,
  releaseForPublication
};
