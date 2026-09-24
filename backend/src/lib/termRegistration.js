// Term registration: a student registers for ALL courses of their
// own department's current level + term at once, never a subset.
//
//   student request  -> term_registration (pending)
//   admin approval   -> one pending-payment enrollment per course
//   student payment  -> enrollment becomes 'enrolled'
//
// The registration is complete only when every course of the term
// has an active (paid) enrollment.

const {
  check,
  id,
  text,
  date
} = require('./common');

const {
  COURSES_PER_TERM,
  termLabel,
  standing,
  termCourses,
  requireFullTerm
} = require('./academic');

const ACTIVE = ['enrolled', 'completed'];

function academicYear(value) {
  const year = text(value, 'academic year', 20);

  const m = /^(\d{4})-(\d{4})$/.exec(year);

  check(
    m && Number(m[2]) === Number(m[1]) + 1,
    'Academic year must look like 2025-2026'
  );

  return year;
}

// The submitted course list must be exactly the term's courses.
function checkSelection(courses, courseIds, s) {
  check(
    Array.isArray(courseIds),
    `Submit all ${COURSES_PER_TERM} courses of your term together`
  );

  const chosen = [...new Set(courseIds.map(v => id(v, 'course')))];

  check(
    chosen.length === courseIds.length,
    'A course is listed more than once'
  );

  const allowed = new Set(courses.map(c => c.course_id));
  const outside = chosen.filter(c => !allowed.has(c));

  check(
    !outside.length,
    `Only ${s.department_code} level ${s.current_level} term ` +
      `${s.current_term} courses can be registered`,
    403
  );

  const missing = courses.filter(c => !chosen.includes(c.course_id));

  check(
    !missing.length,
    `All ${COURSES_PER_TERM} courses of term ` +
      `${termLabel(s.current_level, s.current_term)} are mandatory. ` +
      `Missing: ${missing.map(c => c.course_code).join(', ')}`
  );
}

async function openRegistration(db, studentId, lv, tm) {
  const r = await db.query(`
    SELECT *
    FROM term_registration
    WHERE student_id=$1
      AND level=$2
      AND term=$3
      AND status IN ('pending','approved')
    FOR UPDATE
  `, [studentId, lv, tm]);

  return r.rows[0] || null;
}

// Student submits the whole term. Returns the new registration.
async function requestTerm(db, studentId, body) {
  const s = await standing(db, studentId, true);

  check(s.current_status === 'active', 'Your student account is not active', 403);

  const courses = await termCourses(
    db, s.department_id, s.current_level, s.current_term
  );

  requireFullTerm(courses, s.current_level, s.current_term);
  checkSelection(courses, body.course_ids, s);

  const year = academicYear(body.academic_year);

  const open = await openRegistration(
    db, studentId, s.current_level, s.current_term
  );

  check(
    !open,
    open?.status === 'approved'
      ? 'You are already registered for this term'
      : 'Your registration for this term is awaiting admin approval',
    409
  );

  const r = await db.query(`
    INSERT INTO term_registration (
      student_id,department_id,level,term,academic_year
    )
    VALUES ($1,$2,$3,$4,$5)
    RETURNING *
  `, [
    studentId,
    s.department_id,
    s.current_level,
    s.current_term,
    year
  ]);

  return r.rows[0];
}

// The registration's full term of courses, none already taken.
async function freeTermCourses(db, registration) {
  const courses = await termCourses(
    db,
    registration.department_id,
    registration.level,
    registration.term
  );

  requireFullTerm(courses, registration.level, registration.term);

  const taken = await db.query(`
    SELECT c.course_code
    FROM enrollment e
    JOIN course c ON c.course_id=e.course_id
    WHERE e.student_id=$1
      AND e.course_id = ANY($2)
  `, [
    registration.student_id,
    courses.map(c => c.course_id)
  ]);

  check(
    !taken.rowCount,
    'The student is already enrolled in: ' +
      taken.rows.map(r => r.course_code).join(', '),
    409
  );

  return courses;
}

// One pending-payment enrollment per course of the registration.
async function createEnrollments(db, registration, adminId, enrolledOn = null) {
  const courses = await freeTermCourses(db, registration);

  for (const course of courses) {
    await db.query(`
      INSERT INTO enrollment (
        student_id,course_id,registration_id,
        authorized_by_admin_id,academic_year,term,
        enrolled_on,status,fee_required
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        COALESCE($7::date,CURRENT_DATE),
        'pending_payment',TRUE
      )
    `, [
      registration.student_id,
      course.course_id,
      registration.registration_id,
      adminId,
      registration.academic_year,
      termLabel(registration.level, registration.term),
      enrolledOn
    ]);
  }

  return courses;
}

async function approve(db, registrationId, adminId) {
  const r = await db.query(`
    SELECT *
    FROM term_registration
    WHERE registration_id=$1
      AND status='pending'
    FOR UPDATE
  `, [registrationId]);

  check(r.rowCount, 'Registration not found or already processed', 409);

  const registration = r.rows[0];

  const s = await standing(db, registration.student_id);

  check(s.current_status === 'active', 'The student account is not active', 409);

  const courses = await freeTermCourses(db, registration);

  // Stored procedure: creates the enrollments and approves the request.
  await db.query(
    'CALL approve_term_registration($1,$2)',
    [registrationId, adminId]
  );

  return { registration, courses };
}

// Admin registers a student directly for their current term.
async function authorize(db, body, adminId) {
  const studentId = id(body.student_id, 'student');
  const s = await standing(db, studentId, true);

  check(s.current_status === 'active', 'The student account is not active', 409);

  const open = await openRegistration(
    db, studentId, s.current_level, s.current_term
  );

  check(
    !open,
    open?.status === 'approved'
      ? 'The student is already registered for this term'
      : 'The student has a pending registration for this term; approve it instead',
    409
  );

  const r = await db.query(`
    INSERT INTO term_registration (
      student_id,department_id,level,term,academic_year,
      status,reviewed_by_admin_id,reviewed_on
    )
    VALUES ($1,$2,$3,$4,$5,'approved',$6,CURRENT_TIMESTAMP)
    RETURNING *
  `, [
    studentId,
    s.department_id,
    s.current_level,
    s.current_term,
    academicYear(body.academic_year),
    adminId
  ]);

  const courses = await createEnrollments(
    db,
    r.rows[0],
    adminId,
    date(body.enrolled_on, 'authorization date')
  );

  return { registration: r.rows[0], courses, student: s };
}

// Registration rows with per-course enrollment state and completeness.
const registrationSQL = `
  SELECT
    r.*,
    d.department_code,
    d.department_name,
    s.registration_no,
    s.full_name AS student_name,
    s.email AS student_email,
    a.full_name AS reviewed_by_name,
    COALESCE(x.courses, '[]'::json) AS courses,
    COALESCE(x.active_count, 0) AS active_count,
    COALESCE(x.active_count, 0) = ${COURSES_PER_TERM} AS complete
  FROM term_registration r
  JOIN department d ON d.department_id=r.department_id
  JOIN student s ON s.student_id=r.student_id
  LEFT JOIN admin_public a ON a.admin_id=r.reviewed_by_admin_id
  LEFT JOIN LATERAL (
    SELECT
      json_agg(json_build_object(
        'course_id', c.course_id,
        'course_code', c.course_code,
        'course_title', c.course_title,
        'credit_hours', c.credit_hours,
        'enrollment_id', e.enrollment_id,
        'enrollment_status', e.status
      ) ORDER BY c.course_code) AS courses,
      count(*) FILTER (
        WHERE e.status IN ('${ACTIVE.join("','")}')
      )::int AS active_count
    FROM course c
    LEFT JOIN enrollment e
      ON e.course_id=c.course_id
     AND e.registration_id=r.registration_id
    WHERE c.department_id=r.department_id
      AND c.level=r.level
      AND c.term=r.term
      AND (c.active OR e.enrollment_id IS NOT NULL)
  ) x ON TRUE
`;

module.exports = {
  ACTIVE,
  academicYear,
  requestTerm,
  approve,
  authorize,
  registrationSQL
};
