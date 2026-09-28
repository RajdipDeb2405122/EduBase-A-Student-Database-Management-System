// Three-component marks entry (attendance / CT / semester final).
// The total is a generated column on course_mark and is never
// accepted from the client.

const { check, id } = require('./common');
const { MARK_COMPONENTS, RETAKE_COMPONENT } = require('./grading');

// Components a retake student does not have.
const RETAKE_ONLY_FINAL = MARK_COMPONENTS
  .map(c => c.key)
  .filter(k => k !== RETAKE_COMPONENT);

// One value: blank means "not entered yet"; otherwise a number in
// 0..max with at most two decimals. Anything else is rejected, so an
// out-of-range mark can never reach the database (the CHECK
// constraints on course_mark are the last guard).
function component(value, { key, label, max }, who) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const raw = ['number', 'string'].includes(typeof value)
    ? String(value).trim()
    : '';

  const n = Number(raw);

  check(
    raw !== '' && Number.isFinite(n),
    `${label} for ${who} must be a number (got ${JSON.stringify(value)})`
  );

  check(n >= 0, `${label} for ${who} cannot be negative (got ${raw})`);

  check(
    n <= max,
    `${label} for ${who}: maximum mark is ${max} (got ${raw})`
  );

  check(
    /^\d+(\.\d{1,2})?$/.test(raw),
    `${label} for ${who} must have at most two decimals (got ${raw})`
  );

  return n;
}

// The whole roster (or part of it) submitted by the teacher.
function parseRows(rows) {
  check(
    Array.isArray(rows) && rows.length > 0,
    'Submit at least one student\'s marks'
  );

  check(rows.length <= 500, 'Too many rows in one request');

  const seen = new Set();

  return rows.map(row => {
    check(row && typeof row === 'object', 'Invalid marks row');

    const enrollmentId = id(row.enrollment_id, 'enrollment');

    check(
      !seen.has(enrollmentId),
      `Enrollment ${enrollmentId} is listed more than once`
    );

    seen.add(enrollmentId);

    check(
      !Object.hasOwn(row, 'total'),
      'The total is calculated automatically and cannot be entered'
    );

    const who = row.registration_no
      ? `student ${row.registration_no}`
      : `enrollment ${enrollmentId}`;

    const values = Object.fromEntries(
      MARK_COMPONENTS.map(c => [c.key, component(row[c.key], c, who)])
    );

    return { enrollment_id: enrollmentId, ...values };
  });
}

// Roster of one course for the current teaching cycle: every paid
// (active) enrollment whose result is not published yet, with its
// marks. Retake students are tagged and have only the Final.
async function roster(db, courseId) {
  const r = await db.query(`
    SELECT
      e.enrollment_id,
      e.status AS enrollment_status,
      e.is_retake,
      e.academic_year,
      s.student_id,
      s.registration_no,
      s.full_name,
      m.attendance,
      m.class_test,
      m.semester_final,
      m.total,
      m.updated_at,
      (CASE WHEN e.is_retake
        THEN m.semester_final IS NOT NULL
        ELSE m.total IS NOT NULL
      END) IS TRUE AS complete,
      FALSE AS locked
    FROM enrollment e
    JOIN student s ON s.student_id=e.student_id
    LEFT JOIN course_mark m ON m.enrollment_id=e.enrollment_id
    LEFT JOIN course_result cr ON cr.enrollment_id=e.enrollment_id
    WHERE e.course_id=$1
      AND e.status IN ('enrolled','completed')
      AND cr.enrollment_id IS NULL
    ORDER BY e.is_retake, s.registration_no
  `, [courseId]);

  return r.rows;
}

// Saves the given rows; rows not submitted are left untouched.
async function saveRows(db, courseId, facultyId, rows) {
  const ids = rows.map(r => r.enrollment_id);

  const found = await db.query(`
    SELECT
      e.enrollment_id,
      e.status,
      e.is_retake,
      s.registration_no,
      cr.enrollment_id IS NOT NULL AS locked
    FROM enrollment e
    JOIN student s ON s.student_id=e.student_id
    LEFT JOIN course_result cr ON cr.enrollment_id=e.enrollment_id
    WHERE e.course_id=$1
      AND e.enrollment_id = ANY($2)
    FOR SHARE OF e
  `, [courseId, ids]);

  const byId = new Map(found.rows.map(r => [r.enrollment_id, r]));

  for (const row of rows) {
    const e = byId.get(row.enrollment_id);

    check(
      e,
      `Enrollment ${row.enrollment_id} is not a student of this course`,
      403
    );

    check(
      ['enrolled', 'completed'].includes(e.status),
      `Student ${e.registration_no} has not completed payment for this course`,
      409
    );

    check(
      !e.locked,
      `The result for student ${e.registration_no} is already published; marks are locked`,
      409
    );

    check(
      !e.is_retake || RETAKE_ONLY_FINAL.every(k => row[k] === null),
      `Student ${e.registration_no} is a retake student: only the Final exam mark (out of 70) can be entered`
    );
  }

  const keys = MARK_COMPONENTS.map(c => c.key);

  for (const row of rows) {
    await db.query(`
      INSERT INTO course_mark (
        enrollment_id,${keys.join(',')},entered_by_faculty_id
      )
      VALUES (${
        Array.from({ length: keys.length + 2 }, (_, i) => `$${i + 1}`).join(',')
      })
      ON CONFLICT (enrollment_id) DO UPDATE SET
        ${keys.map(k => `${k}=EXCLUDED.${k}`).join(',')},
        entered_by_faculty_id=EXCLUDED.entered_by_faculty_id,
        updated_at=CURRENT_TIMESTAMP
    `, [
      row.enrollment_id,
      ...keys.map(k => row[k]),
      facultyId
    ]);
  }

  return rows.length;
}

module.exports = {
  parseRows,
  roster,
  saveRows
};
