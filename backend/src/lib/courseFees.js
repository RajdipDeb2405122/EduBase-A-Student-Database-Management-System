const {
  check,
  id,
  text,
  date
} = require('./common');

const FEE_AMOUNT = 1000;

const demoEnabled = () =>
  process.env.DEMO_PAYMENTS_ENABLED === 'true';

const enrollmentSQL = `
  SELECT
    e.*,
    s.registration_no,
    s.full_name AS student_name,
    c.course_code,
    c.course_title,
    c.credit_hours,
    a.full_name AS authorized_by_name,

    CASE
      WHEN e.fee_required THEN 1000.00
      ELSE 0.00
    END AS course_fee,

    CASE
      WHEN NOT e.fee_required THEN 'not_required'
      WHEN cp.course_payment_id IS NOT NULL THEN 'paid'
      WHEN e.status='dropped' THEN 'cancelled'
      ELSE 'pending'
    END AS payment_status,

    cp.course_payment_id,
    cp.receipt_no,
    cp.paid_at

  FROM enrollment e

  JOIN student s
    ON s.student_id=e.student_id

  JOIN course c
    ON c.course_id=e.course_id

  LEFT JOIN admin_public a
    ON a.admin_id=e.authorized_by_admin_id

  LEFT JOIN course_payment cp
    ON cp.enrollment_id=e.enrollment_id
`;

const coursePaymentSQL = `
  SELECT
    'course:' || cp.course_payment_id AS record_key,
    'course_demo'::text AS record_type,

    cp.course_payment_id AS payment_id,
    cp.course_payment_id,
    e.enrollment_id,
    e.student_id,

    s.registration_no,
    s.full_name AS student_name,

    e.course_id,
    c.course_code,
    c.course_title,
    e.academic_year,
    e.term,

    'Course fee: ' || c.course_code AS payment_type,

    cp.amount,
    cp.currency::text AS currency,
    cp.paid_at AS paid_on,
    'paid'::text AS status,
    cp.receipt_no,
    cp.payment_mode

  FROM course_payment cp

  JOIN enrollment e
    ON e.enrollment_id=cp.enrollment_id

  JOIN student s
    ON s.student_id=e.student_id

  JOIN course c
    ON c.course_id=e.course_id
`;

const legacyPaymentSQL = `
  SELECT
    'legacy:' || p.payment_id AS record_key,
    'legacy'::text AS record_type,

    p.payment_id,
    NULL::int AS course_payment_id,
    NULL::int AS enrollment_id,
    p.student_id,

    s.registration_no,
    s.full_name AS student_name,

    NULL::int AS course_id,
    NULL::text AS course_code,
    NULL::text AS course_title,
    p.academic_year,
    p.term,
    p.payment_type,

    p.amount,
    'BDT'::text AS currency,
    p.paid_on::timestamptz AS paid_on,
    p.status,
    NULL::text AS receipt_no,
    'legacy'::text AS payment_mode

  FROM payment p

  JOIN student s
    ON s.student_id=p.student_id
`;

async function listPayments(
  db,
  {
    studentId = null,
    year = null,
    term = null,
    status = null
  } = {}
) {
  const result = await db.query(`
    SELECT *
    FROM (
      ${coursePaymentSQL}
      UNION ALL
      ${legacyPaymentSQL}
    ) payments

    WHERE ($1::int IS NULL OR student_id=$1)
      AND ($2::text IS NULL OR academic_year=$2)
      AND ($3::text IS NULL OR term=$3)
      AND ($4::text IS NULL OR status=$4)

    ORDER BY paid_on DESC NULLS LAST, record_key DESC
  `, [
    studentId,
    year,
    term,
    status
  ]);

  return result.rows;
}

async function createPendingEnrollment(
  db,
  input,
  adminId
) {
  const studentId = id(input.student_id, 'student');
  const courseId = id(input.course_id, 'course');

  const year = text(
    input.academic_year,
    'academic year',
    20
  );

  const term = text(input.term, 'term', 20);

  const enrolledOn = date(
    input.enrolled_on,
    'authorization date'
  );

  const valid = await db.query(`
    SELECT 1
    FROM student s

    JOIN users u
      ON u.user_id=s.user_id

    JOIN course c
      ON c.program_id=s.program_id

    WHERE s.student_id=$1
      AND c.course_id=$2
      AND s.current_status='active'
      AND u.status='active'
      AND c.active=TRUE

    FOR SHARE OF s,u,c
  `, [studentId, courseId]);

  check(
    valid.rowCount,
    'Student/course is inactive or the program does not match'
  );

  const result = await db.query(`
    INSERT INTO enrollment (
      student_id,
      course_id,
      authorized_by_admin_id,
      academic_year,
      term,
      enrolled_on,
      status,
      fee_required
    )
    VALUES (
      $1,$2,$3,$4,$5,
      COALESCE($6::date,CURRENT_DATE),
      'pending_payment',
      TRUE
    )

    ON CONFLICT (
      student_id,
      course_id,
      academic_year,
      term
    )
    DO NOTHING

    RETURNING *
  `, [
    studentId,
    courseId,
    adminId,
    year,
    term,
    enrolledOn
  ]);

  check(
    result.rowCount,
    'An approval/enrollment already exists for this course, year and term',
    409
  );

  return result.rows[0];
}

module.exports = {
  FEE_AMOUNT,
  demoEnabled,
  enrollmentSQL,
  coursePaymentSQL,
  listPayments,
  createPendingEnrollment
};