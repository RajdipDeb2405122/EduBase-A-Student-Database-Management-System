const pool = require('../config/database');

const {
  check, id, text, date, number, grade
} = require('./common');

const resultsSQL = `
  SELECT
    r.result_id AS exam_id,
    x.exam_id AS shared_exam_id,
    r.enrollment_id,r.student_id,
    x.course_id,x.faculty_id,x.academic_year,x.term,
    x.exam_type,x.exam_date,x.total_marks,
    r.obtained_marks,r.grade,r.remarks,
    s.registration_no,s.full_name AS student_name,
    c.course_code,c.course_title
  FROM exam_result r
  JOIN exam x ON x.exam_id=r.exam_id
  JOIN student s ON s.student_id=r.student_id
  JOIN course c ON c.course_id=x.course_id
`;

function definition(body) {
  return {
    exam_type: text(body.exam_type, 'exam type', 50),
    exam_date: date(body.exam_date, 'exam date'),
    total_marks: number(
      body.total_marks,
      'total marks',
      0.01,
      9999.99
    ),
    academic_year: text(body.academic_year, 'academic year', 20),
    term: text(body.term, 'term', 20)
  };
}

async function saveResult(
  db,
  exam,
  enrollmentId,
  body,
  requireActive = false,
  resultId = null
) {
  const e = await db.query(`
    SELECT * FROM enrollment
    WHERE enrollment_id=$1
    FOR SHARE
  `, [id(enrollmentId, 'enrollment')]);

  check(e.rowCount, 'Enrollment not found', 404);

  const en = e.rows[0];

  check(
    en.course_id === exam.course_id &&
      en.academic_year === exam.academic_year &&
      en.term === exam.term,
    'The student is not enrolled in this exam’s course/year/term'
  );

  check(
    !requireActive || ['enrolled', 'completed'].includes(en.status),
    'This enrollment is not active/completed'
  );

  const marks = number(
    body.obtained_marks,
    'obtained marks',
    0,
    Number(exam.total_marks),
    true
  );

  const remarks = text(body.remarks, 'remarks', 2000, false);

  if (resultId !== null) {
    const updated = await db.query(`
      UPDATE exam_result
      SET exam_id=$1,
          obtained_marks=$2,
          grade=$3,
          remarks=$4,
          updated_at=CURRENT_TIMESTAMP
      WHERE result_id=$5
      RETURNING *
    `, [
      exam.exam_id,
      marks,
      grade(marks, exam.total_marks),
      remarks,
      resultId
    ]);

    check(updated.rowCount, 'Result not found', 404);
    return updated.rows[0];
  }

  const r = await db.query(`
    INSERT INTO exam_result (
      exam_id,student_id,enrollment_id,
      obtained_marks,grade,remarks
    )
    VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(exam_id,student_id)
    DO UPDATE SET
      obtained_marks=EXCLUDED.obtained_marks,
      grade=EXCLUDED.grade,
      remarks=EXCLUDED.remarks,
      updated_at=CURRENT_TIMESTAMP
    RETURNING *
  `, [
    exam.exam_id,
    en.student_id,
    en.enrollment_id,
    marks,
    grade(marks, exam.total_marks),
    remarks
  ]);

  return r.rows[0];
}

async function legacyDefinition(db, enrollmentId, body) {
  const r = await db.query(`
    SELECT e.*,c.faculty_id
    FROM enrollment e
    JOIN course c ON c.course_id=e.course_id
    WHERE e.enrollment_id=$1
    FOR SHARE OF e,c
  `, [id(enrollmentId, 'enrollment')]);

  check(r.rowCount, 'Enrollment not found', 404);

  const e = r.rows[0];

  check(
    e.faculty_id,
    'Assign a faculty member to this course before recording an exam',
    409
  );

  const d = definition({
    ...body,
    academic_year: e.academic_year,
    term: e.term
  });

  const values = [
    e.course_id,
    e.faculty_id,
    d.academic_year,
    d.term,
    d.exam_type,
    d.exam_date,
    d.total_marks
  ];

  await db.query(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    [JSON.stringify(values)]
  );

  const found = await db.query(`
    SELECT * FROM exam
    WHERE course_id=$1
      AND faculty_id=$2
      AND academic_year=$3
      AND term=$4
      AND exam_type=$5
      AND exam_date IS NOT DISTINCT FROM $6::date
      AND total_marks=$7
    ORDER BY exam_id
    LIMIT 1
    FOR UPDATE
  `, values);

  if (found.rowCount) return found.rows[0];

  const x = await db.query(`
    INSERT INTO exam (
      course_id,faculty_id,academic_year,term,
      exam_type,exam_date,total_marks,published
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,TRUE)
    RETURNING *
  `, values);

  return x.rows[0];
}

// Result-publication requests live in their own table so the
// shared base schema and migration list do not have to change.
// One request covers an ENTIRE exam: after the admin accepts,
// every student's result for that exam is published together.
// Created lazily on first use; the CREATE promise is memoised,
// while the idempotent upgrade DO-block re-runs on every call so
// an older per-student table is always converted when found.
let publishTable = null;

function ensureExamPublishTables() {
  if (!publishTable) {
    publishTable = pool.query(`
      CREATE TABLE IF NOT EXISTS exam_publish_requests (
        request_id SERIAL PRIMARY KEY,

        exam_id INT NOT NULL
          REFERENCES exam(exam_id)
          ON DELETE CASCADE,

        faculty_id INT NOT NULL
          REFERENCES faculty(faculty_id)
          ON DELETE CASCADE,

        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected')),

        requested_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        reviewed_by_admin_id INT
          REFERENCES admin(admin_id)
          ON DELETE SET NULL,

        reviewed_on TIMESTAMP
      )
    `).catch(error => {
      // Allow a retry after a transient database failure.
      publishTable = null;
      throw error;
    });
  }

  return publishTable
    // Upgrade an older per-student table (if present) to the
    // exam-level design: previously approved requests keep
    // their effect by marking the exam published first, then
    // names/shape are aligned (idempotent; safe on the
    // fresh-install path too).
    .then(() => pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name='exam_publish_requests'
            AND column_name='student_id'
        ) THEN
          UPDATE exam x
          SET published=TRUE
          WHERE EXISTS (
            SELECT 1
            FROM exam_publish_requests q
            WHERE q.exam_id=x.exam_id
              AND q.status='approved'
          );

          UPDATE exam_result r
          SET obtained_marks=0,
              grade='F',
              updated_at=CURRENT_TIMESTAMP
          WHERE r.obtained_marks IS NULL
            AND EXISTS (
              SELECT 1
              FROM exam_publish_requests q
              WHERE q.exam_id=r.exam_id
                AND q.status='approved'
            );

          DELETE FROM exam_publish_requests;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='exam_publish_requests'
            AND column_name='created_at'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='exam_publish_requests'
            AND column_name='requested_on'
        ) THEN
          ALTER TABLE exam_publish_requests
            RENAME COLUMN created_at TO requested_on;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='exam_publish_requests'
            AND column_name='reviewed_at'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='exam_publish_requests'
            AND column_name='reviewed_on'
        ) THEN
          ALTER TABLE exam_publish_requests
            RENAME COLUMN reviewed_at TO reviewed_on;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='exam_publish_requests'
            AND column_name='admin_id'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='exam_publish_requests'
            AND column_name='reviewed_by_admin_id'
        ) THEN
          ALTER TABLE exam_publish_requests
            RENAME COLUMN admin_id TO reviewed_by_admin_id;
        END IF;

        ALTER TABLE exam_publish_requests
          DROP COLUMN IF EXISTS student_id;
        ALTER TABLE exam_publish_requests
          DROP COLUMN IF EXISTS academic_year;
        ALTER TABLE exam_publish_requests
          DROP COLUMN IF EXISTS term;
        ALTER TABLE exam_publish_requests
          DROP COLUMN IF EXISTS admin_remark;

        DROP INDEX IF EXISTS exam_publish_request_pending;
      END $$
    `))
    .then(() => pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        exam_publish_request_pending
      ON exam_publish_requests (exam_id)
      WHERE status='pending'
    `))
    .then(() => pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
        exam_publish_request_approved
      ON exam_publish_requests (exam_id)
      WHERE status='approved'
    `))
    .catch(error => {
      // Allow a retry after a transient database failure.
      publishTable = null;
      throw error;
    });
}

module.exports = {
  resultsSQL,
  definition,
  saveResult,
  legacyDefinition,
  ensureExamPublishTables
};