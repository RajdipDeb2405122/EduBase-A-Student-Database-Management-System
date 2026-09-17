-- ============================================================
-- MODIFICATION: many teachers may teach the same course
-- ============================================================
-- course.faculty_id is kept as the "lead" teacher so that every
-- existing query, report and exam record keeps working.
-- course_teacher holds the full M:N teaching assignment list.
-- ============================================================

CREATE TABLE IF NOT EXISTS course_teacher (
  course_id INT NOT NULL
    REFERENCES course(course_id) ON DELETE CASCADE,

  faculty_id INT NOT NULL
    REFERENCES faculty(faculty_id) ON DELETE CASCADE,

  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (course_id, faculty_id)
);

CREATE INDEX IF NOT EXISTS course_teacher_faculty
  ON course_teacher(faculty_id);

-- Existing single assignments become the first teacher of the course.
INSERT INTO course_teacher (course_id, faculty_id)
SELECT course_id, faculty_id
FROM course
WHERE faculty_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Single source of truth for "does this teacher teach this course?"
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
  )
  OR EXISTS (
    SELECT 1
    FROM course c
    WHERE c.course_id = p_course_id
      AND c.faculty_id = p_faculty_id
  );
$$;

-- Keep course.faculty_id pointing at a real current teacher.
CREATE OR REPLACE FUNCTION sync_course_lead_teacher()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE course
    SET faculty_id = NEW.faculty_id
    WHERE course_id = NEW.course_id
      AND faculty_id IS NULL;

    RETURN NEW;
  END IF;

  UPDATE course c
  SET faculty_id = (
    SELECT ct.faculty_id
    FROM course_teacher ct
    WHERE ct.course_id = OLD.course_id
    ORDER BY ct.assigned_at, ct.faculty_id
    LIMIT 1
  )
  WHERE c.course_id = OLD.course_id
    AND c.faculty_id = OLD.faculty_id;

  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS course_teacher_sync ON course_teacher;

CREATE TRIGGER course_teacher_sync
AFTER INSERT OR DELETE ON course_teacher
FOR EACH ROW
EXECUTE FUNCTION sync_course_lead_teacher();
