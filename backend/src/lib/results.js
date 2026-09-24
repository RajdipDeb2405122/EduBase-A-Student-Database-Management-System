// Result publication per department + level + term.
//
// A student's term result is computed only when all courses of the
// term have a paid enrollment with every marks component entered.
// Everyone else is excluded, with the reasons listed. Publishing
// again later adds students who have since become complete;
// already-published results never change.

const { check } = require('./common');
const { MARK_COMPONENTS, gradeFor, weightedAverage } = require('./grading');
const { termCourses, requireFullTerm, termLabel } = require('./academic');

const ACTIVE = ['enrolled', 'completed'];

async function evaluate(db, departmentId, lv, tm) {
  const courses = await termCourses(db, departmentId, lv, tm);
  requireFullTerm(courses, lv, tm);

  const courseIds = courses.map(c => c.course_id);

  const [people, enrollments, publication] = await Promise.all([
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
    `, [courseIds]),

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

    if (reasons.length) {
      return { ...base, state: 'excluded', reasons };
    }

    return {
      ...base,
      state: 'eligible',
      reasons: [],
      courses: rows,
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

  for (const s of eligible) {
    await db.query(`
      INSERT INTO term_result (
        student_id,department_id,level,term,credits,gpa,cgpa
      )
      VALUES ($1,$2,$3,$4,$5,$6,$6)
    `, [s.student_id, departmentId, lv, tm, s.credits, s.gpa]);

    for (const c of s.courses) {
      await db.query(`
        INSERT INTO course_result (
          enrollment_id,student_id,level,term,
          total,letter_grade,grade_point,credit_hours
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        c.enrollment_id, s.student_id, lv, tm,
        c.total, c.letter_grade, c.grade_point, c.credit_hours
      ]);
    }

    await db.query(`
      UPDATE enrollment SET status='completed'
      WHERE enrollment_id = ANY($1)
    `, [s.courses.map(c => c.enrollment_id)]);

    s.cgpa = await recomputeCgpa(db, s.student_id);
  }

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
      cr.credit_hours,
      m.attendance,
      m.class_test,
      m.semester_final,
      cr.total,
      cr.letter_grade,
      cr.grade_point
    FROM course_result cr
    JOIN enrollment e ON e.enrollment_id=cr.enrollment_id
    JOIN course c ON c.course_id=e.course_id
    JOIN course_mark m ON m.enrollment_id=cr.enrollment_id
    WHERE cr.student_id=$1 AND cr.level=$2 AND cr.term=$3
    ORDER BY c.course_code
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
  evaluate,
  publish,
  recomputeCgpa,
  studentResult
};
