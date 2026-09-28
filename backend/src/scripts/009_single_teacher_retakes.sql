-- ============================================================
-- 009: one teacher per course offering, retakes, progression
-- ============================================================
-- A course row is one offering: department + level + term. Its
-- teaching cycle ends when the admin publishes that term's result.
--
--   1. course_teacher keeps history. At most ONE active (not
--      released) teacher per course; publishing releases it.
--   2. Enrollments can be retakes of a failed course (Final only,
--      out of 70). A student holds a course once as a regular
--      enrollment and at most once as an open retake.
--   3. course_result records retakes; CGPA uses the latest attempt
--      of every course (the retake replaces the failed attempt).
-- Safe on the existing database: nothing is deleted.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Teaching assignments: history + one active teacher
-- ------------------------------------------------------------

ALTER TABLE course_teacher
  ADD COLUMN course_teacher_id SERIAL;

ALTER TABLE course_teacher
  DROP CONSTRAINT course_teacher_pkey;

ALTER TABLE course_teacher
  ADD CONSTRAINT course_teacher_pkey PRIMARY KEY (course_teacher_id);

ALTER TABLE course_teacher
  ADD COLUMN released_at TIMESTAMPTZ;

ALTER TABLE course_teacher
  ADD COLUMN release_reason VARCHAR(20)
    CHECK (release_reason IN ('removed', 'published', 'duplicate'));

ALTER TABLE course_teacher
  ADD CONSTRAINT course_teacher_release_pair
    CHECK ((released_at IS NULL) = (release_reason IS NULL));

-- Legacy assignments recorded only on course.faculty_id.
INSERT INTO course_teacher (course_id, faculty_id)
SELECT c.course_id, c.faculty_id
FROM course c
WHERE c.faculty_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM course_teacher ct
    WHERE ct.course_id = c.course_id
      AND ct.faculty_id = c.faculty_id
  );

-- Duplicates: keep the course's lead teacher (course.faculty_id),
-- otherwise the earliest assignment; release the others. They stay
-- in the table as history, so no record is lost.
DO $$
DECLARE
  d RECORD;
BEGIN
  FOR d IN
    WITH ranked AS (
      SELECT
        ct.course_teacher_id,
        ct.course_id,
        ct.faculty_id,
        row_number() OVER (
          PARTITION BY ct.course_id
          ORDER BY (ct.faculty_id = c.faculty_id) DESC NULLS LAST,
                   ct.assigned_at,
                   ct.faculty_id
        ) AS rank
      FROM course_teacher ct
      JOIN course c ON c.course_id = ct.course_id
    )
    UPDATE course_teacher ct
    SET released_at = CURRENT_TIMESTAMP,
        release_reason = 'duplicate'
    FROM ranked r
    WHERE r.course_teacher_id = ct.course_teacher_id
      AND r.rank > 1
    RETURNING ct.course_id, ct.faculty_id
  LOOP
    RAISE NOTICE 'Released duplicate teaching assignment: course % faculty %',
      d.course_id, d.faculty_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX course_teacher_one_active
  ON course_teacher(course_id)
  WHERE released_at IS NULL;

-- A released assignment is history and never comes back.
CREATE FUNCTION guard_course_teacher()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.course_id, NEW.faculty_id) IS DISTINCT FROM
     (OLD.course_id, OLD.faculty_id)
     OR (OLD.released_at IS NOT NULL
         AND NEW.released_at IS DISTINCT FROM OLD.released_at)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'A teaching assignment can only be released, not changed';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER check_course_teacher
BEFORE UPDATE ON course_teacher
FOR EACH ROW EXECUTE FUNCTION guard_course_teacher();

-- course.faculty_id always mirrors the active teacher (or NULL).
CREATE OR REPLACE FUNCTION sync_course_lead_teacher()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target INT := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.course_id
    ELSE NEW.course_id
  END;
BEGIN
  UPDATE course c
  SET faculty_id = (
    SELECT ct.faculty_id
    FROM course_teacher ct
    WHERE ct.course_id = target
      AND ct.released_at IS NULL
  )
  WHERE c.course_id = target;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS course_teacher_sync ON course_teacher;

CREATE TRIGGER course_teacher_sync
AFTER INSERT OR UPDATE OR DELETE ON course_teacher
FOR EACH ROW
EXECUTE FUNCTION sync_course_lead_teacher();

UPDATE course c
SET faculty_id = (
  SELECT ct.faculty_id
  FROM course_teacher ct
  WHERE ct.course_id = c.course_id
    AND ct.released_at IS NULL
);

-- Only the active assignment grants marks access.
CREATE OR REPLACE FUNCTION faculty_teaches(
  p_course_id INT,
  p_faculty_id INT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM course_teacher ct
    WHERE ct.course_id = p_course_id
      AND ct.faculty_id = p_faculty_id
      AND ct.released_at IS NULL
  );
$$;


-- ------------------------------------------------------------
-- 2. Retake enrollments
-- ------------------------------------------------------------

ALTER TABLE enrollment
  ADD COLUMN is_retake BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE enrollment
  DROP CONSTRAINT enrollment_student_course_unique;

CREATE UNIQUE INDEX enrollment_regular_once
  ON enrollment(student_id, course_id)
  WHERE NOT is_retake;

CREATE UNIQUE INDEX enrollment_one_open_retake
  ON enrollment(student_id, course_id)
  WHERE is_retake AND status IN ('pending_payment', 'enrolled');

-- TRUE when the student's latest published attempt of the course
-- is an F (failed and not yet cleared).
CREATE FUNCTION course_uncleared(
  p_student_id INT,
  p_course_id INT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((
    SELECT cr.letter_grade = 'F'
    FROM course_result cr
    JOIN enrollment e ON e.enrollment_id = cr.enrollment_id
    WHERE cr.student_id = p_student_id
      AND e.course_id = p_course_id
    ORDER BY cr.level DESC, cr.term DESC
    LIMIT 1
  ), FALSE);
$$;

-- Same rules as 005, plus: is_retake is part of the identity, and
-- a retake needs a failed, uncleared course.
CREATE OR REPLACE FUNCTION protect_enrollment_fee()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT NEW.fee_required
       OR NEW.status IS DISTINCT FROM 'pending_payment'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'New enrollments must start with a pending course fee';
    END IF;

    IF NEW.is_retake
       AND NOT course_uncleared(NEW.student_id, NEW.course_id)
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'A retake is only possible for a failed course that has not been cleared';
    END IF;
  ELSE
    IF (
      NEW.student_id,
      NEW.course_id,
      NEW.academic_year,
      NEW.term,
      NEW.fee_required,
      NEW.is_retake
    ) IS DISTINCT FROM (
      OLD.student_id,
      OLD.course_id,
      OLD.academic_year,
      OLD.term,
      OLD.fee_required,
      OLD.is_retake
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'An enrollment identity and fee requirement cannot be changed';
    END IF;
  END IF;

  IF NEW.fee_required
     AND NEW.status IN ('enrolled', 'completed')
     AND NOT EXISTS (
       SELECT 1
       FROM course_payment
       WHERE enrollment_id = NEW.enrollment_id
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'The course fee must be paid before enrollment can be completed';
  END IF;

  IF NEW.status = 'pending_payment'
     AND EXISTS (
       SELECT 1
       FROM course_payment
       WHERE enrollment_id = NEW.enrollment_id
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'A paid enrollment cannot be charged again';
  END IF;

  RETURN NEW;
END $$;


-- ------------------------------------------------------------
-- 3. Marks guard: retakes are Final-only; only the active teacher
-- ------------------------------------------------------------
-- The 0..10 / 0..20 / 0..70 CHECK constraints from 007 remain the
-- final guard on every component's range.

CREATE OR REPLACE FUNCTION guard_course_mark()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target INT := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.enrollment_id
    ELSE NEW.enrollment_id
  END;
  e enrollment%ROWTYPE;
BEGIN
  IF EXISTS (
    SELECT 1 FROM course_result WHERE enrollment_id = target
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Marks cannot change after the result is published';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT * INTO e FROM enrollment WHERE enrollment_id = target;

  IF e.enrollment_id IS NULL
     OR e.status NOT IN ('enrolled', 'completed')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Marks require a paid, active enrollment';
  END IF;

  IF e.is_retake
     AND (NEW.attendance IS NOT NULL OR NEW.class_test IS NOT NULL)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Retake students are assessed on the Final exam only (out of 70)';
  END IF;

  IF NEW.entered_by_faculty_id IS NOT NULL
     AND NOT faculty_teaches(e.course_id, NEW.entered_by_faculty_id)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Only the teacher currently assigned to this course can enter its marks';
  END IF;

  RETURN NEW;
END $$;


-- ------------------------------------------------------------
-- 4. Course results: retake marker and the raw (unpenalised) grade
-- ------------------------------------------------------------
-- A retake's course_result belongs to the term in which it was
-- taken (the student's term at the time), so it is published with
-- that term. `total` holds the grading percentage (final / 70).

ALTER TABLE course_result
  ADD COLUMN is_retake BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE course_result
  ADD COLUMN raw_letter_grade VARCHAR(2);

ALTER TABLE course_result
  ADD COLUMN raw_grade_point NUMERIC(3,2)
    CHECK (raw_grade_point BETWEEN 0 AND 4);

ALTER TABLE course_result
  ADD CONSTRAINT course_result_retake_raw
    CHECK (is_retake = (raw_grade_point IS NOT NULL));


-- ------------------------------------------------------------
-- 5. CGPA: latest attempt of each course, credits counted once
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
  FROM (
    SELECT DISTINCT ON (e.course_id)
      cr.grade_point,
      cr.credit_hours
    FROM course_result cr
    JOIN enrollment e ON e.enrollment_id = cr.enrollment_id
    WHERE cr.student_id = p_student_id
      AND (cr.level < p_level OR (cr.level = p_level AND cr.term <= p_term))
    ORDER BY e.course_id, cr.level DESC, cr.term DESC
  ) latest;
$$;
