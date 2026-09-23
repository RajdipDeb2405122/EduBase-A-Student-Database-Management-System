-- ============================================================
-- 007: statistical FUNCTION + multi-step PROCEDURE
-- ============================================================

-- exam_publish_requests is normally created lazily by the API;
-- create it here too so the procedure below always has its table.
CREATE TABLE IF NOT EXISTS exam_publish_requests (
  request_id SERIAL PRIMARY KEY,
  exam_id INT NOT NULL REFERENCES exam(exam_id) ON DELETE CASCADE,
  faculty_id INT NOT NULL REFERENCES faculty(faculty_id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_admin_id INT REFERENCES admin(admin_id) ON DELETE SET NULL,
  reviewed_on TIMESTAMP
);

-- ------------------------------------------------------------
-- FUNCTION compute_cgpa(student_id) -> NUMERIC(4,2)
-- Credit-weighted CGPA (4.00 scale) computed from PUBLISHED
-- results only. For every enrolled course the percentage is
-- SUM(obtained) / SUM(total) of its published exams, converted
-- to a grade point, then weighted by course credit hours.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_cgpa(p_student_id INT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  WITH per_course AS (
    SELECT
      c.course_id,
      c.credit_hours,
      100.0 * SUM(r.obtained_marks) / NULLIF(SUM(x.total_marks), 0) AS pct
    FROM exam_result r
    JOIN exam x   ON x.exam_id = r.exam_id
    JOIN course c ON c.course_id = x.course_id
    WHERE r.student_id = p_student_id
      AND x.published = TRUE
      AND r.obtained_marks IS NOT NULL
    GROUP BY c.course_id, c.credit_hours
  ),
  points AS (
    SELECT
      credit_hours,
      CASE
        WHEN pct >= 90 THEN 4.00
        WHEN pct >= 85 THEN 3.75
        WHEN pct >= 80 THEN 3.50
        WHEN pct >= 75 THEN 3.25
        WHEN pct >= 70 THEN 3.00
        WHEN pct >= 65 THEN 2.75
        WHEN pct >= 60 THEN 2.50
        WHEN pct >= 55 THEN 2.25
        WHEN pct >= 50 THEN 2.00
        WHEN pct >= 40 THEN 1.00
        ELSE 0.00
      END AS gp
    FROM per_course
    WHERE pct IS NOT NULL
  )
  SELECT COALESCE(
    ROUND(SUM(gp * credit_hours) / NULLIF(SUM(credit_hours), 0), 2),
    0.00
  )
  FROM points;
$$;

-- ------------------------------------------------------------
-- PROCEDURE review_exam_publish(request, admin, decision, INOUT students)
-- One multi-table workflow:
--   1. lock + validate the pending request
--   2. mark it approved / rejected
--   3. (approve) zero-fill blank marks as 0 / F      -> exam_result
--   4. (approve) publish the exam                    -> exam
--   5. write the audit entry                         -> admin_action_log
-- Runs inside the caller's BEGIN ... COMMIT; any error aborts all steps.
-- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE review_exam_publish(
  p_request_id INT,
  p_admin_id   INT,
  p_decision   TEXT,
  INOUT p_students INT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_exam_id INT;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision %', p_decision
      USING ERRCODE = '22023';
  END IF;

  SELECT exam_id INTO v_exam_id
  FROM exam_publish_requests
  WHERE request_id = p_request_id
    AND status = 'pending'
  FOR UPDATE;

  IF v_exam_id IS NULL THEN
    RAISE EXCEPTION 'Request not found or already reviewed'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::int INTO p_students
  FROM exam_result
  WHERE exam_id = v_exam_id;

  UPDATE exam_publish_requests
  SET status = p_decision,
      reviewed_by_admin_id = p_admin_id,
      reviewed_on = CURRENT_TIMESTAMP
  WHERE request_id = p_request_id;

  IF p_decision = 'approved' THEN
    UPDATE exam_result
    SET obtained_marks = 0,
        grade = 'F',
        updated_at = CURRENT_TIMESTAMP
    WHERE exam_id = v_exam_id
      AND obtained_marks IS NULL;

    UPDATE exam
    SET published = TRUE
    WHERE exam_id = v_exam_id;
  END IF;

  INSERT INTO admin_action_log
    (admin_id, target_table, target_id, action_type, new_value)
  VALUES (
    p_admin_id,
    'exam_publish_requests',
    p_request_id,
    CASE WHEN p_decision = 'approved' THEN 'APPROVE' ELSE 'REJECT' END,
    CASE WHEN p_decision = 'approved'
      THEN 'Approved exam publication; all student results published, blank marks recorded as 0'
      ELSE 'Rejected exam publication request'
    END
  );
END;
$$;
