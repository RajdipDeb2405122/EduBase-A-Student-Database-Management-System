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

module.exports = {
  resultsSQL,
  definition,
  saveResult,
  legacyDefinition
};