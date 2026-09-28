// Result publication per department + level + term.
//
// A student's term result is computed only when all courses of the
// term have a paid enrollment with every marks component entered,
// and every paid retake taken in that term has its Final mark.
// Everyone else is excluded, with the reasons listed. Publishing
// again later adds students who have since become complete;
// already-published results never change.
//
// Publishing (one transaction, under an advisory lock) also
//   - releases the term's teaching assignments (lib/teaching.js),
//   - moves every newly published student to the next level-term,
//   - cancels unpaid retake enrollments of those students, so the
//     failed course is offered again next term.
// A student is published at most once per level-term (term_result
// primary key), so nobody advances twice.

const { check } = require('./common');
const {
  MARK_COMPONENTS,
  RETAKE_COMPONENT,
  gradeFor,
  retakeGrade,
  weightedAverage
} = require('./grading');
const {
  LEVELS,
  TERMS,
  termCourses,
  requireFullTerm,
  termLabel
} = require('./academic');
const { releaseForPublication } = require('./teaching');

const ACTIVE = ['enrolled', 'completed'];

async function evaluate(db, departmentId, lv, tm) {
  const courses = await termCourses(db, departmentId, lv, tm);
  requireFullTerm(courses, lv, tm);

  const courseIds = courses.map(c => c.course_id);

  const [people, enrollments, retakes, publication] = await Promise.all([
    db.query(`
      SELECT
        s.student_id,
        s.registration_no,
        s.full_name,
        r.status AS registration_status,
        tr.gpa AS published_gpa,
        tr.published_at
      FROM student s
      LEFT JOIN term_registration r
        ON r.student_id=s.student_id
       AND r.department_id=$1
       AND r.level=$2
       AND r.term=$3
       AND r.status IN ('pending','approved')
      LEFT JOIN term_result tr
        ON tr.student_id=s.student_id
       AND tr.level=$2
       AND tr.term=$3
      WHERE r.registration_id IS NOT NULL
        OR tr.student_id IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM enrollment e
          WHERE e.student_id=s.student_id
            AND e.course_id = ANY($4)
            AND NOT e.is_retake
        )
      ORDER BY s.registration_no
    `, [departmentId, lv, tm, courseIds]),

    db.query(`
      SELECT
        e.enrollment_id,
        e.student_id,
        e.course_id,
        e.status,
        m.attendance,
        m.class_test,
        m.semester_final,
        m.total
      FROM enrollment e
      LEFT JOIN course_mark m ON m.enrollment_id=e.enrollment_id
      WHERE e.course_id = ANY($1)
        AND NOT e.is_retake
    `, [courseIds]),

    // Retakes taken while registered for this department term.
    db.query(`
      SELECT
        e.enrollment_id,
        e.student_id,
        e.course_id,
        e.status,
        c.course_code,
        c.course_title,
        c.credit_hours,
        m.semester_final
      FROM enrollment e
      JOIN term_registration r ON r.registration_id=e.registration_id
      JOIN course c ON c.course_id=e.course_id
      LEFT JOIN course_mark m ON m.enrollment_id=e.enrollment_id
      LEFT JOIN course_result cr ON cr.enrollment_id=e.enrollment_id
      WHERE e.is_retake
        AND r.department_id=$1
        AND r.level=$2
        AND r.term=$3
        AND cr.enrollment_id IS NULL
      ORDER BY c.course_code
    `, [departmentId, lv, tm]),

    db.query(`
      SELECT *
      FROM result_publication
      WHERE department_id=$1 AND level=$2 AND term=$3
    `, [departmentId, lv, tm])
  ]);

  const byStudent = new Map();

  for (const e of enrollments.rows) {
    if (!byStudent.has(e.student_id)) byStudent.set(e.student_id, new Map());
    byStudent.get(e.student_id).set(e.course_id, e);
  }

  const retakesOf = new Map();

  for (const e of retakes.rows) {
    if (!retakesOf.has(e.student_id)) retakesOf.set(e.student_id, []);
    retakesOf.get(e.student_id).push(e);
  }

  const students = people.rows.map(person => {
    const own = byStudent.get(person.student_id) || new Map();

    const base = {
      student_id: person.student_id,
      registration_no: person.registration_no,
      full_name: person.full_name
    };

    if (person.published_gpa !== null) {
      return {
        ...base,
        state: 'published',
        gpa: Number(person.published_gpa),
        reasons: []
      };
    }

    const reasons = [];

    if (person.registration_status === 'pending') {
      reasons.push('Term registration is awaiting admin approval');
    }

    const rows = courses.map(course => {
      const e = own.get(course.course_id);

      if (!e) {
        if (person.registration_status !== 'pending') {
          reasons.push(`${course.course_code}: not registered`);
        }
        return null;
      }

      if (e.status === 'pending_payment') {
        reasons.push(`${course.course_code}: course fee not paid`);
        return null;
      }

      if (!ACTIVE.includes(e.status)) {
        reasons.push(`${course.course_code}: enrollment ${e.status}`);
        return null;
      }

      const missing = MARK_COMPONENTS
        .filter(c => e[c.key] === null || e[c.key] === undefined)
        .map(c => c.label);

      if (missing.length) {
        reasons.push(
          missing.length === MARK_COMPONENTS.length
            ? `${course.course_code}: no marks entered`
            : `${course.course_code}: ${missing.join(', ')} missing`
        );
        return null;
      }

      const grade = gradeFor(e.total);

      return {
        enrollment_id: e.enrollment_id,
        course_id: course.course_id,
        course_code: course.course_code,
        credit_hours: Number(course.credit_hours),
        total: Number(e.total),
        letter_grade: grade.letter,
        grade_point: grade.point
      };
    });

    // Unpaid retakes are not part of the result (cancelled on
    // publish); paid ones need their Final mark.
    const retakeRows = (retakesOf.get(person.student_id) || [])
      .filter(e => ACTIVE.includes(e.status))
      .map(e => {
        if (e[RETAKE_COMPONENT] === null) {
          reasons.push(`${e.course_code} (Retake): Final mark missing`);
          return null;
        }

        const grade = retakeGrade(e[RETAKE_COMPONENT]);

        return {
          enrollment_id: e.enrollment_id,
          course_id: e.course_id,
          course_code: e.course_code,
          credit_hours: Number(e.credit_hours),
          total: grade.percentage,
          letter_grade: grade.letter,
          grade_point: grade.point,
          raw_letter_grade: grade.raw.letter,
          raw_grade_point: grade.raw.point,
          passed: grade.passed
        };
      });

    if (reasons.length) {
      return { ...base, state: 'excluded', reasons };
    }

    // The term GPA covers the term's own courses; retakes count
    // towards the CGPA (replacing the failed attempt).
    return {
      ...base,
      state: 'eligible',
      reasons: [],
      courses: rows,
      retakes: retakeRows,
      credits: rows.reduce((sum, r) => sum + r.credit_hours, 0),
      gpa: weightedAverage(rows)
    };
  });

  return {
    level: lv,
    term: tm,
    label: termLabel(lv, tm),
    courses,
    publication: publication.rows[0] || null,
    students
  };
}

// Cumulative CGPA per published term, in level/term order, and the
// student's current CGPA. Credit-weighted over course grade points.
async function recomputeCgpa(db, studentId) {
  // student_cgpa() is a SQL function (migration 008).
  await db.query(`
    UPDATE term_result
    SET cgpa=student_cgpa(student_id,level,term)
    WHERE student_id=$1
  `, [studentId]);

  const r = await db.query(`
    UPDATE student
    SET current_cgpa=student_cgpa(student_id)
    WHERE student_id=$1
    RETURNING current_cgpa
  `, [studentId]);

  const cgpa = r.rows[0]?.current_cgpa;
  return cgpa == null ? null : Number(cgpa);
}

// The level-term after lv-tm, or null after the final term.
function nextTerm(lv, tm) {
  if (tm < TERMS) return { level: lv, term: tm + 1 };
  if (lv < LEVELS) return { level: lv + 1, term: 1 };
  return null;
}

// Moves a just-published student on. Only a student still sitting in
// lv-tm moves, so the step can never be applied twice. After the
// final term the student stays at 4-2 and is marked graduated once
// no failed course is left uncleared (otherwise stays active).
async function advance(db, studentId, lv, tm) {
  const next = nextTerm(lv, tm);

  if (next) {
    const r = await db.query(`
      UPDATE student
      SET current_level=$4, current_term=$5
      WHERE student_id=$1 AND current_level=$2 AND current_term=$3
      RETURNING current_level, current_term
    `, [studentId, lv, tm, next.level, next.term]);

    return r.rowCount ? termLabel(next.level, next.term) : null;
  }

  const r = await db.query(`
    UPDATE student s
    SET current_status='graduated'
    WHERE s.student_id=$1
      AND s.current_level=$2 AND s.current_term=$3
      AND NOT EXISTS (
        SELECT 1
        FROM enrollment e
        WHERE e.student_id=s.student_id
          AND course_uncleared(s.student_id, e.course_id)
      )
    RETURNING student_id
  `, [studentId, lv, tm]);

  return r.rowCount ? 'graduated' : null;
}

async function publish(db, departmentId, lv, tm, adminId) {
  await db.query(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    [`publish:${departmentId}:${lv}:${tm}`]
  );

  const evaluation = await evaluate(db, departmentId, lv, tm);
  const eligible = evaluation.students.filter(s => s.state === 'eligible');

  check(
    eligible.length,
    evaluation.students.some(s => s.state === 'published')
      ? 'Every student with complete marks is already published'
      : 'No student has complete marks for all courses of this term',
    409
  );

  await db.query(`
    INSERT INTO result_publication (
      department_id,level,term,published_by_admin_id
    )
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (department_id,level,term) DO UPDATE SET
      last_published_at=CURRENT_TIMESTAMP,
      published_by_admin_id=EXCLUDED.published_by_admin_id
  `, [departmentId, lv, tm, adminId]);

  const retakeCourseIds = new Set();

  for (const s of eligible) {
    await db.query(`
      INSERT INTO term_result (
        student_id,department_id,level,term,credits,gpa,cgpa
      )
      VALUES ($1,$2,$3,$4,$5,$6,$6)
    `, [s.student_id, departmentId, lv, tm, s.credits, s.gpa]);

    for (const c of [...s.courses, ...s.retakes]) {
      const retake = s.retakes.includes(c);

      await db.query(`
        INSERT INTO course_result (
          enrollment_id,student_id,level,term,
          total,letter_grade,grade_point,credit_hours,
          is_retake,raw_letter_grade,raw_grade_point
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `, [
        c.enrollment_id, s.student_id, lv, tm,
        c.total, c.letter_grade, c.grade_point, c.credit_hours,
        retake,
        retake ? c.raw_letter_grade : null,
        retake ? c.raw_grade_point : null
      ]);

      if (retake) retakeCourseIds.add(c.course_id);
    }

    await db.query(`
      UPDATE enrollment SET status='completed'
      WHERE enrollment_id = ANY($1)
    `, [[...s.courses, ...s.retakes].map(c => c.enrollment_id)]);

    // Unpaid retakes lapse; the course is offered again next term.
    await db.query(`
      UPDATE enrollment e
      SET status='dropped'
      FROM term_registration r
      WHERE r.registration_id=e.registration_id
        AND e.student_id=$1
        AND e.is_retake
        AND e.status='pending_payment'
        AND r.department_id=$2
        AND r.level=$3
        AND r.term=$4
    `, [s.student_id, departmentId, lv, tm]);

    s.cgpa = await recomputeCgpa(db, s.student_id);
    s.advanced_to = await advance(db, s.student_id, lv, tm);
  }

  evaluation.released = await releaseForPublication(
    db, departmentId, lv, tm, [...retakeCourseIds]
  );

  return evaluation;
}

// What the student sees for one level + term.
async function studentResult(db, student, lv, tm) {
  const tr = await db.query(`
    SELECT *
    FROM term_result
    WHERE student_id=$1 AND level=$2 AND term=$3
  `, [student.student_id, lv, tm]);

  const completed = await db.query(`
    SELECT count(*)::int AS n
    FROM term_result
    WHERE student_id=$1
  `, [student.student_id]);

  const cgpa = {
    value: student.current_cgpa === null ? null : Number(student.current_cgpa),
    completed_terms: completed.rows[0].n
  };

  if (!tr.rowCount) {
    const pub = await db.query(`
      SELECT 1 FROM result_publication
      WHERE department_id=$1 AND level=$2 AND term=$3
    `, [student.department_id, lv, tm]);

    return {
      level: lv,
      term: tm,
      published: false,
      // Published for the department, but this student's marks were
      // incomplete at the time.
      withheld: pub.rowCount > 0,
      cgpa
    };
  }

  const courses = await db.query(`
    SELECT
      c.course_code,
      c.course_title,
      c.level AS course_level,
      c.term AS course_term,
      cr.credit_hours,
      m.attendance,
      m.class_test,
      m.semester_final,
      cr.total,
      cr.letter_grade,
      cr.grade_point,
      cr.is_retake,
      cr.raw_letter_grade,
      cr.raw_grade_point,
      -- A later attempt (retake) replaces this one in the CGPA.
      EXISTS (
        SELECT 1
        FROM course_result later
        JOIN enrollment le ON le.enrollment_id=later.enrollment_id
        WHERE later.student_id=cr.student_id
          AND le.course_id=e.course_id
          AND (later.level, later.term) > (cr.level, cr.term)
      ) AS superseded
    FROM course_result cr
    JOIN enrollment e ON e.enrollment_id=cr.enrollment_id
    JOIN course c ON c.course_id=e.course_id
    JOIN course_mark m ON m.enrollment_id=cr.enrollment_id
    WHERE cr.student_id=$1 AND cr.level=$2 AND cr.term=$3
    ORDER BY cr.is_retake, c.course_code
  `, [student.student_id, lv, tm]);

  const row = tr.rows[0];

  return {
    level: lv,
    term: tm,
    published: true,
    published_at: row.published_at,
    components: MARK_COMPONENTS,
    courses: courses.rows,
    credits: Number(row.credits),
    gpa: Number(row.gpa),
    cgpa_through_term: Number(row.cgpa),
    cgpa
  };
}

module.exports = {
  nextTerm,
  evaluate,
  publish,
  recomputeCgpa,
  studentResult
};
