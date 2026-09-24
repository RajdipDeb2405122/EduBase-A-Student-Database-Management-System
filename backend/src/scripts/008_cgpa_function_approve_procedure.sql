-- ============================================================
-- 008: CGPA function + term-registration approval procedure
-- ============================================================


-- ------------------------------------------------------------
-- 1. student_cgpa(): credit-weighted CGPA of a student over every
--    published course result up to and including level/term.
--    Returns NULL when nothing has been published yet.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION student_cgpa(
  p_student_id INT,
  p_level INT DEFAULT 4,
  p_term INT DEFAULT 2
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT ROUND(
    SUM(grade_point * credit_hours) / NULLIF(SUM(credit_hours), 0),
    2
  )
  FROM course_result
  WHERE student_id = p_student_id
    AND (level < p_level OR (level = p_level AND term <= p_term));
$$;


-- ------------------------------------------------------------
-- 2. approve_term_registration(): admin approves a pending term
--    registration. In one operation it
--      a) creates a pending-payment enrollment for every active
--         course of that department + level + term, and
--      b) marks the registration approved.
-- ------------------------------------------------------------

CREATE OR REPLACE PROCEDURE approve_term_registration(
  p_registration_id INT,
  p_admin_id INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  r term_registration%ROWTYPE;
BEGIN
  SELECT * INTO r
  FROM term_registration
  WHERE registration_id = p_registration_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found or already processed';
  END IF;

  INSERT INTO enrollment (
    student_id, course_id, registration_id,
    authorized_by_admin_id, academic_year, term,
    enrolled_on, status, fee_required
  )
  SELECT
    r.student_id, c.course_id, r.registration_id,
    p_admin_id, r.academic_year, r.level || '-' || r.term,
    CURRENT_DATE, 'pending_payment', TRUE
  FROM course c
  WHERE c.department_id = r.department_id
    AND c.level = r.level
    AND c.term = r.term
    AND c.active = TRUE;

  UPDATE term_registration
  SET status = 'approved',
      reviewed_by_admin_id = p_admin_id,
      reviewed_on = CURRENT_TIMESTAMP
  WHERE registration_id = p_registration_id;
END;
$$;
