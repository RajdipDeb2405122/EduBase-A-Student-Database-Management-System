-- Existing enrollments are grandfathered.
-- Do not invent historical course payments.

ALTER TABLE enrollment
  ADD COLUMN fee_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE enrollment
  ALTER COLUMN fee_required SET DEFAULT TRUE;

ALTER TABLE enrollment
  ALTER COLUMN status SET DEFAULT 'pending_payment';

CREATE TABLE course_payment (
  course_payment_id SERIAL PRIMARY KEY,

  enrollment_id INT NOT NULL UNIQUE
    REFERENCES enrollment(enrollment_id)
    ON DELETE RESTRICT,

  amount NUMERIC(10,2) NOT NULL DEFAULT 1000.00
    CHECK (amount = 1000.00),

  currency CHAR(3) NOT NULL DEFAULT 'BDT'
    CHECK (currency = 'BDT'),

  payment_mode VARCHAR(20) NOT NULL DEFAULT 'demo'
    CHECK (payment_mode = 'demo'),

  receipt_no VARCHAR(80) NOT NULL UNIQUE
    CHECK (receipt_no LIKE 'DEMO-%'),

  paid_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Deleting a student must not indirectly erase historical payments.
ALTER TABLE payment
  DROP CONSTRAINT payment_student_id_fkey;

ALTER TABLE payment
  ADD CONSTRAINT payment_student_id_fkey
  FOREIGN KEY (student_id)
  REFERENCES student(student_id)
  ON DELETE RESTRICT;

CREATE FUNCTION protect_enrollment_fee()
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
  ELSE
    IF (
      NEW.student_id,
      NEW.course_id,
      NEW.academic_year,
      NEW.term,
      NEW.fee_required
    ) IS DISTINCT FROM (
      OLD.student_id,
      OLD.course_id,
      OLD.academic_year,
      OLD.term,
      OLD.fee_required
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

CREATE TRIGGER guard_enrollment_fee
BEFORE INSERT OR UPDATE ON enrollment
FOR EACH ROW
EXECUTE FUNCTION protect_enrollment_fee();

CREATE FUNCTION protect_course_payment()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  e enrollment%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Course payment receipts are immutable';
  END IF;

  SELECT *
  INTO e
  FROM enrollment
  WHERE enrollment_id = NEW.enrollment_id
  FOR UPDATE;

  IF e.enrollment_id IS NULL
     OR NOT e.fee_required
     OR e.status IS DISTINCT FROM 'pending_payment'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Payment requires an approved, unpaid course enrollment';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER guard_course_payment
BEFORE INSERT OR UPDATE OR DELETE ON course_payment
FOR EACH ROW
EXECUTE FUNCTION protect_course_payment();

-- Receipt creation and enrollment activation must commit together.
CREATE FUNCTION check_paid_enrollment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM enrollment
    WHERE enrollment_id = NEW.enrollment_id
      AND status = 'pending_payment'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Payment and enrollment activation must commit together';
  END IF;

  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER payment_activation_check
AFTER INSERT ON course_payment
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_paid_enrollment();

-- An unpaid enrollment must not acquire exam results.
CREATE FUNCTION prevent_unpaid_results()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM enrollment e
    WHERE e.enrollment_id = NEW.enrollment_id
      AND e.fee_required
      AND NOT EXISTS (
        SELECT 1
        FROM course_payment p
        WHERE p.enrollment_id = e.enrollment_id
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Results cannot be created for an unpaid course enrollment';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER guard_unpaid_results
BEFORE INSERT OR UPDATE ON exam_result
FOR EACH ROW
EXECUTE FUNCTION prevent_unpaid_results();