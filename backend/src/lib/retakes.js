// Retakes of failed courses.
//
// A course whose latest published attempt is an F stays "uncleared"
// and is offered as a Retake in every later term until it is passed.
// Failing never blocks progression (lib/results.js advances the
// student anyway).
//
//   student picks a retake -> pending-payment enrollment (is_retake),
//                             attached to their approved registration
//                             for the current term
//   student pays the fee   -> enrollment becomes 'enrolled' (same
//                             demo payment flow as regular courses)
//   assigned teacher       -> enters the Final only (0-70)
//   admin publishes term   -> retake graded with the penalty
//                             (lib/grading.js retakeGrade)
//
// The DB enforces the same rules: protect_enrollment_fee() refuses a
// retake of a course that is not failed/uncleared, and the
// enrollment_one_open_retake index allows one open retake per course.

const { check, id } = require('./common');
const { termLabel, standing } = require('./academic');

// Every failed, uncleared course of the student with its open
// retake enrollment (if any) and that enrollment's payment state.
async function options(db, studentId) {
  const r = await db.query(`
    WITH latest AS (
      SELECT DISTINCT ON (e.course_id)
        e.course_id,
        cr.letter_grade,
        cr.level AS failed_level,
        cr.term AS failed_term,
        cr.is_retake AS failed_on_retake
      FROM course_result cr
      JOIN enrollment e ON e.enrollment_id=cr.enrollment_id
      WHERE cr.student_id=$1
      ORDER BY e.course_id, cr.level DESC, cr.term DESC
    )
    SELECT
      c.course_id,
      c.course_code,
      c.course_title,
      c.credit_hours,
      c.level,
      c.term,
      c.active,
      l.failed_level,
      l.failed_term,
      l.failed_on_retake,
      f.full_name AS faculty_name,
      o.enrollment_id,
      o.status AS enrollment_status,
      o.term AS enrollment_term,
      (cp.course_payment_id IS NOT NULL) AS paid
    FROM latest l
    JOIN course c ON c.course_id=l.course_id
    LEFT JOIN faculty_public f ON f.faculty_id=c.faculty_id
    LEFT JOIN enrollment o
      ON o.student_id=$1
     AND o.course_id=l.course_id
     AND o.is_retake
     AND o.status IN ('pending_payment','enrolled')
    LEFT JOIN course_payment cp ON cp.enrollment_id=o.enrollment_id
    WHERE l.letter_grade='F'
    ORDER BY c.level, c.term, c.course_code
  `, [studentId]);

  return r.rows;
}

// The student enrolls in a retake for their current term.
async function enroll(db, studentId, courseValue) {
  const courseId = id(courseValue, 'course');
  const s = await standing(db, studentId, true);

  check(s.current_status === 'active', 'Your student account is not active', 403);

  const offered = (await options(db, studentId))
    .find(o => o.course_id === courseId);

  check(
    offered,
    'Only a failed course that has not been cleared can be retaken',
    409
  );

  check(
    !offered.enrollment_id,
    offered.enrollment_status === 'pending_payment'
      ? 'This retake is already awaiting payment'
      : 'You are already enrolled in this retake',
    409
  );

  check(offered.active, 'This course is inactive. Contact the administration.', 409);

  const reg = await db.query(`
    SELECT *
    FROM term_registration
    WHERE student_id=$1
      AND level=$2
      AND term=$3
      AND status='approved'
  `, [studentId, s.current_level, s.current_term]);

  check(
    reg.rowCount,
    `Retakes are added to your Level ${s.current_level}, Term ` +
      `${s.current_term} registration. Register for the term and wait ` +
      'for admin approval first.',
    409
  );

  const registration = reg.rows[0];

  const r = await db.query(`
    INSERT INTO enrollment (
      student_id,course_id,registration_id,
      academic_year,term,status,fee_required,is_retake
    )
    VALUES ($1,$2,$3,$4,$5,'pending_payment',TRUE,TRUE)
    RETURNING *
  `, [
    studentId,
    courseId,
    registration.registration_id,
    registration.academic_year,
    termLabel(s.current_level, s.current_term)
  ]);

  return { enrollment: r.rows[0], course: offered };
}

module.exports = {
  options,
  enroll
};
