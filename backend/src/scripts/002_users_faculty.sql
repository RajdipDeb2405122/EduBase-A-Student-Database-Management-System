-- Apply through migrate.js to the schema supplied in EduBase111.pdf.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Resolve duplicate case-insensitive user emails before migrating.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM users u WHERE
      (u.role='admin' AND NOT EXISTS(
        SELECT 1 FROM admin a WHERE a.user_id=u.user_id
      )) OR
      (u.role='student' AND NOT EXISTS(
        SELECT 1 FROM student s WHERE s.user_id=u.user_id
      )) OR
      (u.role='faculty' AND NOT EXISTS(
        SELECT 1 FROM faculty f WHERE f.user_id=u.user_id
      ))
  ) THEN
    RAISE EXCEPTION
      'Some users have no subtype row. Repair incomplete seed/profile records before migrating.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM exam x
    JOIN enrollment e USING (enrollment_id)
    JOIN course c USING (course_id)
    WHERE c.faculty_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Assign faculty to courses having existing exam records before migrating.';
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN token_version INT NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD CONSTRAINT users_id_role_unique UNIQUE (user_id, role);

CREATE UNIQUE INDEX users_email_ci
  ON users (lower(btrim(email)));

-- UNIQUE(user_id) already exists on each subtype.
-- These composite FKs additionally enforce the correct user role.

ALTER TABLE admin
  ADD COLUMN account_role VARCHAR(20) NOT NULL DEFAULT 'admin'
    CHECK (account_role='admin');

ALTER TABLE admin
  ADD FOREIGN KEY (user_id, account_role)
    REFERENCES users(user_id, role) ON DELETE CASCADE;

ALTER TABLE student
  ADD COLUMN account_role VARCHAR(20) NOT NULL DEFAULT 'student'
    CHECK (account_role='student');

ALTER TABLE student
  ADD FOREIGN KEY (user_id, account_role)
    REFERENCES users(user_id, role) ON DELETE CASCADE;

ALTER TABLE faculty
  ADD COLUMN account_role VARCHAR(20) NOT NULL DEFAULT 'faculty'
    CHECK (account_role='faculty');

ALTER TABLE faculty
  ADD FOREIGN KEY (user_id, account_role)
    REFERENCES users(user_id, role) ON DELETE CASCADE;

ALTER TABLE faculty ADD COLUMN office_location VARCHAR(100);
ALTER TABLE faculty ADD COLUMN office_hours VARCHAR(200);

-- Authentication belongs to users.
-- Retain old student display fields for existing screens and queries.

ALTER TABLE student DROP COLUMN password_hash;

UPDATE student s
SET full_name=u.full_name,
    email=u.email,
    phone=u.phone,
    date_of_birth=u.date_of_birth
FROM users u
WHERE u.user_id=s.user_id;

UPDATE faculty f
SET phone=u.phone
FROM users u
WHERE u.user_id=f.user_id;

CREATE FUNCTION sync_user_display_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE student
  SET full_name=NEW.full_name,
      email=NEW.email,
      phone=NEW.phone,
      date_of_birth=NEW.date_of_birth
  WHERE user_id=NEW.user_id;

  UPDATE faculty
  SET phone=NEW.phone
  WHERE user_id=NEW.user_id;

  RETURN NEW;
END $$;

CREATE TRIGGER sync_user_display
AFTER UPDATE OF full_name,email,phone,date_of_birth ON users
FOR EACH ROW EXECUTE FUNCTION sync_user_display_fields();

-- Read-only compatibility views. Account writes still use the base tables.

CREATE VIEW faculty_public AS
SELECT
  f.faculty_id,
  f.user_id,
  f.department_id,
  f.designation,
  f.office_location,
  f.office_hours,
  u.full_name,
  u.email,
  u.phone,
  u.status
FROM faculty f
JOIN users u ON u.user_id=f.user_id;

CREATE VIEW admin_public AS
SELECT a.*,u.full_name,u.email,u.username
FROM admin a
JOIN users u ON u.user_id=a.user_id;

CREATE TABLE faculty_registration_requests (
  request_id SERIAL PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  department_id INT NOT NULL REFERENCES department(department_id),
  designation VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  requested_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_admin_id INT
    REFERENCES admin(admin_id) ON DELETE SET NULL,
  reviewed_on TIMESTAMP,
  rejection_reason TEXT
);

CREATE UNIQUE INDEX faculty_request_pending_email
  ON faculty_registration_requests (lower(btrim(email)))
  WHERE status='pending';

ALTER TABLE student_registration_requests
  DROP CONSTRAINT IF EXISTS
    student_registration_requests_registration_no_key;

CREATE UNIQUE INDEX student_request_pending_email
  ON student_registration_requests (lower(btrim(email)))
  WHERE status='pending';

CREATE UNIQUE INDEX student_request_pending_number
  ON student_registration_requests (registration_no)
  WHERE status='pending';

-- Allow another course request after rejection.
-- Only simultaneous pending requests must be unique.

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid='course_registration_requests'::regclass
      AND contype='u'
  LOOP
    EXECUTE format(
      'ALTER TABLE course_registration_requests DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

CREATE UNIQUE INDEX course_request_pending
ON course_registration_requests (
  student_id,course_id,academic_year,term
)
WHERE status='pending';

-- Faculty 1:M exam.
-- Exam M:N student through exam_result.

ALTER TABLE exam
  ADD COLUMN faculty_id INT
    REFERENCES faculty(faculty_id) ON DELETE RESTRICT;

ALTER TABLE exam
  ADD COLUMN course_id INT
    REFERENCES course(course_id) ON DELETE RESTRICT;

ALTER TABLE exam ADD COLUMN academic_year VARCHAR(20);
ALTER TABLE exam ADD COLUMN term VARCHAR(20);
ALTER TABLE exam ADD COLUMN published BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE exam
  ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE exam x
SET faculty_id=c.faculty_id,
    course_id=e.course_id,
    academic_year=e.academic_year,
    term=e.term,
    published=TRUE
FROM enrollment e
JOIN course c ON c.course_id=e.course_id
WHERE x.enrollment_id=e.enrollment_id;

ALTER TABLE exam ALTER COLUMN faculty_id SET NOT NULL;
ALTER TABLE exam ALTER COLUMN course_id SET NOT NULL;
ALTER TABLE exam ALTER COLUMN academic_year SET NOT NULL;
ALTER TABLE exam ALTER COLUMN term SET NOT NULL;

ALTER TABLE exam
  ADD CONSTRAINT exam_positive_total CHECK (total_marks > 0);

CREATE TABLE exam_result (
  result_id SERIAL PRIMARY KEY,
  exam_id INT NOT NULL REFERENCES exam(exam_id) ON DELETE CASCADE,
  student_id INT NOT NULL
    REFERENCES student(student_id) ON DELETE CASCADE,
  enrollment_id INT NOT NULL
    REFERENCES enrollment(enrollment_id) ON DELETE CASCADE,
  obtained_marks DECIMAL(6,2) CHECK (obtained_marks >= 0),
  grade VARCHAR(5),
  remarks TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_id,student_id)
);

-- Preserve historical IDs, scores, grades and remarks exactly.

INSERT INTO exam_result (
  result_id,exam_id,student_id,enrollment_id,
  obtained_marks,grade,remarks
)
SELECT
  x.exam_id,x.exam_id,e.student_id,x.enrollment_id,
  x.obtained_marks,x.grade,x.remarks
FROM exam x
JOIN enrollment e USING(enrollment_id);

ALTER TABLE exam DROP COLUMN obtained_marks;
ALTER TABLE exam DROP COLUMN grade;
ALTER TABLE exam DROP COLUMN remarks;
ALTER TABLE exam DROP COLUMN enrollment_id;

CREATE INDEX exam_faculty ON exam(faculty_id);
CREATE INDEX exam_offering ON exam(course_id,academic_year,term);
CREATE INDEX exam_result_student ON exam_result(student_id);
CREATE INDEX exam_result_enrollment ON exam_result(enrollment_id);

CREATE FUNCTION validate_exam_result()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  x exam%ROWTYPE;
  e enrollment%ROWTYPE;
BEGIN
  SELECT * INTO x
  FROM exam
  WHERE exam_id=NEW.exam_id
  FOR SHARE;

  SELECT * INTO e
  FROM enrollment
  WHERE enrollment_id=NEW.enrollment_id
  FOR SHARE;

  IF x.exam_id IS NULL
     OR e.enrollment_id IS NULL
     OR e.student_id IS DISTINCT FROM NEW.student_id
     OR (e.course_id,e.academic_year,e.term)
        IS DISTINCT FROM
        (x.course_id,x.academic_year,x.term)
     OR NEW.obtained_marks > x.total_marks
  THEN
    RAISE EXCEPTION USING
      ERRCODE='23514',
      MESSAGE='Invalid exam/enrollment/marks combination';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER check_exam_result
BEFORE INSERT OR UPDATE ON exam_result
FOR EACH ROW EXECUTE FUNCTION validate_exam_result();

CREATE FUNCTION guard_exam_definition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM exam_result WHERE exam_id=OLD.exam_id
  ) AND
    (NEW.course_id,NEW.academic_year,NEW.term,NEW.total_marks)
    IS DISTINCT FROM
    (OLD.course_id,OLD.academic_year,OLD.term,OLD.total_marks)
  THEN
    RAISE EXCEPTION USING
      ERRCODE='23514',
      MESSAGE='Cannot change the definition of an exam that has results';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER protect_exam_definition
BEFORE UPDATE ON exam
FOR EACH ROW EXECUTE FUNCTION guard_exam_definition();

-- Repair sequences left behind by explicit IDs in the original seed script.

DO $$
DECLARE
  t text;
  key_name text;
  seq_name text;
  maximum_id bigint;
  seq_value bigint;
  called boolean;
BEGIN
  FOREACH t IN ARRAY
    ARRAY['users','admin','student','faculty','exam','exam_result']
  LOOP
    key_name := CASE t
      WHEN 'users' THEN 'user_id'
      WHEN 'exam_result' THEN 'result_id'
      ELSE t||'_id'
    END;

    seq_name := pg_get_serial_sequence(t,key_name);

    EXECUTE format(
      'SELECT COALESCE(MAX(%I),0) FROM %I',
      key_name,t
    ) INTO maximum_id;

    EXECUTE format(
      'SELECT last_value,is_called FROM %s',
      seq_name
    ) INTO seq_value,called;

    PERFORM setval(
      seq_name::regclass,
      GREATEST(maximum_id,seq_value),
      called OR maximum_id>0
    );
  END LOOP;
END $$;

-- Enforce exactly one matching subtype at transaction commit.
-- Registration requests are not actual users until approval.

CREATE FUNCTION assert_user_subtype(uid int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE kind text;
BEGIN
  SELECT role INTO kind FROM users WHERE user_id=uid;
  IF kind IS NULL THEN RETURN; END IF;

  IF (kind='admin' AND NOT EXISTS(
        SELECT 1 FROM admin WHERE user_id=uid
      ))
     OR (kind='student' AND NOT EXISTS(
        SELECT 1 FROM student WHERE user_id=uid
      ))
     OR (kind='faculty' AND NOT EXISTS(
        SELECT 1 FROM faculty WHERE user_id=uid
      ))
  THEN
    RAISE EXCEPTION USING
      ERRCODE='23514',
      MESSAGE='A user must have exactly one matching subtype';
  END IF;
END $$;

CREATE FUNCTION check_user_subtype()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN
    PERFORM assert_user_subtype(OLD.user_id);
  END IF;

  IF TG_OP<>'DELETE' THEN
    PERFORM assert_user_subtype(NEW.user_id);
  END IF;

  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER user_subtype_check
AFTER INSERT OR UPDATE OR DELETE ON users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_user_subtype();

CREATE CONSTRAINT TRIGGER admin_subtype_check
AFTER INSERT OR UPDATE OR DELETE ON admin
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_user_subtype();

CREATE CONSTRAINT TRIGGER student_subtype_check
AFTER INSERT OR UPDATE OR DELETE ON student
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_user_subtype();

CREATE CONSTRAINT TRIGGER faculty_subtype_check
AFTER INSERT OR UPDATE OR DELETE ON faculty
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_user_subtype();