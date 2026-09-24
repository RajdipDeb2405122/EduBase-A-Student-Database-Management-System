-- ============================================================
-- MODIFICATION: department course catalog, term registration,
-- three-component marks and department/level/term results.
-- ============================================================
-- DESTRUCTIVE for academic records tied to the old catalog:
-- every course, enrollment, course payment receipt, course
-- request, exam and exam result is removed. Accounts,
-- departments, programs, scholarships and legacy payments stay.
-- The new catalog is loaded by `npm run db:seed-catalog`.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Remove the old catalog and everything that depends on it
-- ------------------------------------------------------------

-- Receipts are normally immutable; this one-off cleanup is the
-- only place that bypasses the guard.
ALTER TABLE course_payment DISABLE TRIGGER guard_course_payment;
DELETE FROM course_payment;
ALTER TABLE course_payment ENABLE TRIGGER guard_course_payment;

-- The single-number exam system is replaced by course_mark.
-- exam_publish_requests was created lazily by lib/exams.js.
DROP TABLE IF EXISTS exam_publish_requests;
DROP TABLE exam_result;
DROP TABLE exam;
DROP FUNCTION validate_exam_result();
DROP FUNCTION guard_exam_definition();
DROP FUNCTION prevent_unpaid_results();

-- Per-course requests are replaced by term_registration.
DROP TABLE course_registration_requests;

DELETE FROM enrollment;
DELETE FROM course_teacher;
DELETE FROM course;


-- ------------------------------------------------------------
-- 2. Department code (the catalog file names departments by code)
-- ------------------------------------------------------------

ALTER TABLE department
  ADD COLUMN department_code VARCHAR(10)
    CHECK (department_code ~ '^[A-Z]{2,10}$');

UPDATE department
SET department_code = CASE department_name
  WHEN 'Computer Science & Engineering' THEN 'CSE'
  WHEN 'Electrical & Electronic Engineering' THEN 'EEE'
  WHEN 'Civil Engineering' THEN 'CE'
  WHEN 'Mechanical Engineering' THEN 'ME'
END;

ALTER TABLE department
  ADD CONSTRAINT department_code_unique UNIQUE (department_code);


-- ------------------------------------------------------------
-- 3. Course: owned by a department, placed at level + term
-- ------------------------------------------------------------
-- The same code can be offered by two departments (IPE 493 is in
-- CSE 4-2 and EEE 3-2), so the code is unique per department.

ALTER TABLE course DROP CONSTRAINT course_course_code_key;
DROP INDEX idx_course_program;

ALTER TABLE course DROP COLUMN program_id;
ALTER TABLE course DROP COLUMN term_no;

ALTER TABLE course
  ADD COLUMN department_id INT NOT NULL
    REFERENCES department(department_id) ON DELETE RESTRICT;

ALTER TABLE course
  ADD COLUMN level SMALLINT NOT NULL
    CHECK (level BETWEEN 1 AND 4);

ALTER TABLE course
  ADD COLUMN term SMALLINT NOT NULL
    CHECK (term BETWEEN 1 AND 2);

ALTER TABLE course
  ADD CONSTRAINT course_credit_positive CHECK (credit_hours > 0);

ALTER TABLE course
  ADD CONSTRAINT course_code_format
    CHECK (course_code ~ '^[A-Z]{2,5} [0-9]{3}$');

ALTER TABLE course
  ADD CONSTRAINT course_department_code_unique
    UNIQUE (department_id, course_code);

CREATE INDEX course_department_level_term
  ON course(department_id, level, term);


-- ------------------------------------------------------------
-- 4. Student: current level + term; CGPA is derived
-- ------------------------------------------------------------
-- NULL CGPA means "no completed term yet", which is different
-- from a genuine 0.00. No results survive this migration.

ALTER TABLE student
  ADD COLUMN current_level SMALLINT NOT NULL DEFAULT 1
    CHECK (current_level BETWEEN 1 AND 4);

ALTER TABLE student
  ADD COLUMN current_term SMALLINT NOT NULL DEFAULT 1
    CHECK (current_term BETWEEN 1 AND 2);

ALTER TABLE student ALTER COLUMN current_cgpa DROP DEFAULT;
UPDATE student SET current_cgpa = NULL;


-- ------------------------------------------------------------
-- 5. Term registration: all courses of a term, as one request
-- ------------------------------------------------------------

CREATE TABLE term_registration (
  registration_id SERIAL PRIMARY KEY,

  student_id INT NOT NULL
    REFERENCES student(student_id) ON DELETE CASCADE,

  department_id INT NOT NULL
    REFERENCES department(department_id) ON DELETE RESTRICT,

  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 4),
  term SMALLINT NOT NULL CHECK (term BETWEEN 1 AND 2),

  academic_year VARCHAR(20) NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),

  requested_on TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  reviewed_by_admin_id INT
    REFERENCES admin(admin_id) ON DELETE SET NULL,

  reviewed_on TIMESTAMPTZ,
  rejection_reason TEXT
);

-- A rejected registration may be resubmitted.
CREATE UNIQUE INDEX term_registration_open
  ON term_registration(student_id, level, term)
  WHERE status IN ('pending', 'approved');

CREATE INDEX term_registration_status
  ON term_registration(status);

-- Every enrollment now belongs to a term registration, and a
-- student can hold a course only once.
ALTER TABLE enrollment
  ADD COLUMN registration_id INT NOT NULL
    REFERENCES term_registration(registration_id) ON DELETE RESTRICT;

ALTER TABLE enrollment
  DROP CONSTRAINT enrollment_student_id_course_id_academic_year_term_key;

ALTER TABLE enrollment
  ADD CONSTRAINT enrollment_student_course_unique
    UNIQUE (student_id, course_id);

CREATE INDEX enrollment_registration
  ON enrollment(registration_id);

-- Deleting a course must never silently erase enrollments.
ALTER TABLE enrollment DROP CONSTRAINT enrollment_course_id_fkey;

ALTER TABLE enrollment
  ADD CONSTRAINT enrollment_course_id_fkey
    FOREIGN KEY (course_id) REFERENCES course(course_id)
    ON DELETE RESTRICT;


-- ------------------------------------------------------------
-- 6. Marks: three components, total is derived
-- ------------------------------------------------------------
-- The ranges mirror MARK_COMPONENTS in lib/grading.js.

CREATE TABLE course_mark (
  enrollment_id INT PRIMARY KEY
    REFERENCES enrollment(enrollment_id) ON DELETE RESTRICT,

  attendance NUMERIC(4,2)
    CHECK (attendance BETWEEN 0 AND 10),

  class_test NUMERIC(4,2)
    CHECK (class_test BETWEEN 0 AND 20),

  semester_final NUMERIC(4,2)
    CHECK (semester_final BETWEEN 0 AND 70),

  -- NULL until every component is entered.
  total NUMERIC(5,2) GENERATED ALWAYS AS
    (attendance + class_test + semester_final) STORED,

  entered_by_faculty_id INT
    REFERENCES faculty(faculty_id) ON DELETE SET NULL,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ------------------------------------------------------------
-- 7. Results, published per department + level + term
-- ------------------------------------------------------------

CREATE TABLE result_publication (
  department_id INT NOT NULL
    REFERENCES department(department_id) ON DELETE RESTRICT,

  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 4),
  term SMALLINT NOT NULL CHECK (term BETWEEN 1 AND 2),

  published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  published_by_admin_id INT
    REFERENCES admin(admin_id) ON DELETE SET NULL,

  PRIMARY KEY (department_id, level, term)
);

CREATE TABLE term_result (
  student_id INT NOT NULL
    REFERENCES student(student_id) ON DELETE RESTRICT,

  department_id INT NOT NULL,
  level SMALLINT NOT NULL,
  term SMALLINT NOT NULL,

  credits NUMERIC(6,2) NOT NULL CHECK (credits > 0),
  gpa NUMERIC(3,2) NOT NULL CHECK (gpa BETWEEN 0 AND 4),

  -- Cumulative CGPA over every published term up to this one.
  cgpa NUMERIC(3,2) NOT NULL CHECK (cgpa BETWEEN 0 AND 4),

  published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (student_id, level, term),

  FOREIGN KEY (department_id, level, term)
    REFERENCES result_publication(department_id, level, term)
    ON DELETE RESTRICT
);

CREATE TABLE course_result (
  enrollment_id INT PRIMARY KEY
    REFERENCES enrollment(enrollment_id) ON DELETE RESTRICT,

  student_id INT NOT NULL,
  level SMALLINT NOT NULL,
  term SMALLINT NOT NULL,

  total NUMERIC(5,2) NOT NULL CHECK (total BETWEEN 0 AND 100),
  letter_grade VARCHAR(2) NOT NULL,
  grade_point NUMERIC(3,2) NOT NULL CHECK (grade_point BETWEEN 0 AND 4),
  credit_hours NUMERIC(4,2) NOT NULL CHECK (credit_hours > 0),

  FOREIGN KEY (student_id, level, term)
    REFERENCES term_result(student_id, level, term)
    ON DELETE CASCADE
);

CREATE INDEX course_result_term
  ON course_result(student_id, level, term);


-- ------------------------------------------------------------
-- 8. Marks guard: active enrollments only, frozen once published
-- ------------------------------------------------------------

CREATE FUNCTION guard_course_mark()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target INT := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.enrollment_id
    ELSE NEW.enrollment_id
  END;
BEGIN
  IF EXISTS (
    SELECT 1 FROM course_result WHERE enrollment_id = target
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Marks cannot change after the result is published';
  END IF;

  IF TG_OP <> 'DELETE' AND NOT EXISTS (
    SELECT 1
    FROM enrollment
    WHERE enrollment_id = target
      AND status IN ('enrolled', 'completed')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Marks require a paid, active enrollment';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER check_course_mark
BEFORE INSERT OR UPDATE OR DELETE ON course_mark
FOR EACH ROW EXECUTE FUNCTION guard_course_mark();
