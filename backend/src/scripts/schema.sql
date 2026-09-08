-- ============================================================
-- EduBase Database Schema
-- MODIFICATION 1
--
-- USER is now the parent entity of:
--     ADMIN
--     STUDENT
--     FACULTY
--
-- Existing student/admin functionality is preserved.
-- Common authentication information is introduced in USER.
-- ============================================================


-- ============================================================
-- DROP TABLES
-- ============================================================

DROP TABLE IF EXISTS course_registration_requests CASCADE;
DROP TABLE IF EXISTS admin_action_log CASCADE;
DROP TABLE IF EXISTS payment CASCADE;
DROP TABLE IF EXISTS exam CASCADE;
DROP TABLE IF EXISTS enrollment CASCADE;
DROP TABLE IF EXISTS scholarship CASCADE;
DROP TABLE IF EXISTS student_registration_requests CASCADE;
DROP TABLE IF EXISTS student CASCADE;
DROP TABLE IF EXISTS course CASCADE;
DROP TABLE IF EXISTS faculty CASCADE;
DROP TABLE IF EXISTS admin CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS program CASCADE;
DROP TABLE IF EXISTS department CASCADE;


-- ============================================================
-- 1. USER
-- ============================================================
-- Parent entity for every person who can use EduBase.
--
-- role:
--     admin
--     student
--     faculty
--
-- status:
--     active
--     pending
--     blocked
--     inactive
-- ============================================================

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,

    username VARCHAR(50) UNIQUE,

    email VARCHAR(100) UNIQUE NOT NULL,

    password_hash VARCHAR(255) NOT NULL,

    full_name VARCHAR(100) NOT NULL,

    phone VARCHAR(20),

    date_of_birth DATE,

    role VARCHAR(20) NOT NULL,

    status VARCHAR(20) DEFAULT 'active',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    last_login TIMESTAMP,

    CONSTRAINT chk_user_role
        CHECK (role IN ('admin', 'student', 'faculty')),

    CONSTRAINT chk_user_status
        CHECK (status IN ('active', 'pending', 'blocked', 'inactive'))
);


-- ============================================================
-- 2. DEPARTMENT
-- ============================================================

CREATE TABLE department (
    department_id SERIAL PRIMARY KEY,

    department_name VARCHAR(100) NOT NULL,

    office_location VARCHAR(100),

    phone VARCHAR(20)
);


-- ============================================================
-- 3. PROGRAM
-- ============================================================

CREATE TABLE program (
    program_id SERIAL PRIMARY KEY,

    department_id INT NOT NULL
        REFERENCES department(department_id)
        ON DELETE RESTRICT,

    program_name VARCHAR(100) NOT NULL,

    degree_level VARCHAR(50) NOT NULL,

    duration_years INT NOT NULL,

    total_credits DECIMAL(6,2)
);


-- ============================================================
-- 4. ADMIN
-- ============================================================
-- ADMIN is a subtype of USER.
--
-- admin_id remains because the existing application already
-- uses admin_id everywhere.
--
-- user_id connects ADMIN to USER.
-- ============================================================

CREATE TABLE admin (
    admin_id SERIAL PRIMARY KEY,

    user_id INT UNIQUE NOT NULL
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    role VARCHAR(50) DEFAULT 'admin',

    status VARCHAR(20) DEFAULT 'active',

    last_login TIMESTAMP
);


-- ============================================================
-- 5. FACULTY
-- ============================================================
-- FACULTY is a subtype of USER.
--
-- Teacher login will be implemented in a later modification.
-- For now we establish the USER -> FACULTY relationship.
-- ============================================================

CREATE TABLE faculty (
    faculty_id SERIAL PRIMARY KEY,

    user_id INT UNIQUE NOT NULL
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    department_id INT NOT NULL
        REFERENCES department(department_id)
        ON DELETE RESTRICT,

    designation VARCHAR(50),

    phone VARCHAR(20)
);


-- ============================================================
-- 6. STUDENT
-- ============================================================
-- STUDENT is a subtype of USER.
--
-- Existing fields are temporarily retained for compatibility
-- with the current application.
--
-- In a later cleanup modification, common fields can be
-- removed from here and read exclusively from USER.
-- ============================================================

CREATE TABLE student (
    student_id SERIAL PRIMARY KEY,

    user_id INT UNIQUE NOT NULL
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    program_id INT NOT NULL
        REFERENCES program(program_id)
        ON DELETE RESTRICT,

    advisor_id INT
        REFERENCES faculty(faculty_id)
        ON DELETE SET NULL,

    verified_by_admin_id INT
        REFERENCES admin(admin_id)
        ON DELETE SET NULL,

    registration_no VARCHAR(50) UNIQUE NOT NULL,

    full_name VARCHAR(100) NOT NULL,

    email VARCHAR(100) NOT NULL,

    phone VARCHAR(20),

    date_of_birth DATE,

    admission_date DATE NOT NULL,

    current_status VARCHAR(20) DEFAULT 'active',

    current_cgpa DECIMAL(4,2) DEFAULT 0.00,

    password_hash VARCHAR(255),

    CONSTRAINT chk_student_cgpa
        CHECK (current_cgpa >= 0 AND current_cgpa <= 4.00)
);


-- ============================================================
-- 7. COURSE
-- ============================================================

CREATE TABLE course (
    course_id SERIAL PRIMARY KEY,

    program_id INT NOT NULL
        REFERENCES program(program_id)
        ON DELETE RESTRICT,

    faculty_id INT
        REFERENCES faculty(faculty_id)
        ON DELETE SET NULL,

    course_code VARCHAR(20) UNIQUE NOT NULL,

    course_title VARCHAR(200) NOT NULL,

    credit_hours DECIMAL(4,2) NOT NULL,

    term_no INT NOT NULL,

    course_type VARCHAR(50),

    active BOOLEAN DEFAULT TRUE
);


-- ============================================================
-- 8. SCHOLARSHIP
-- ============================================================

CREATE TABLE scholarship (
    scholarship_id SERIAL PRIMARY KEY,

    student_id INT NOT NULL
        REFERENCES student(student_id)
        ON DELETE CASCADE,

    scholarship_name VARCHAR(100) NOT NULL,

    award_type VARCHAR(50),

    amount DECIMAL(12,2),

    awarded_on DATE,

    valid_until DATE,

    status VARCHAR(20) DEFAULT 'active',

    CONSTRAINT chk_scholarship_amount
        CHECK (amount >= 0)
);


-- ============================================================
-- 9. ADMIN ACTION LOG
-- ============================================================

CREATE TABLE admin_action_log (
    log_id SERIAL PRIMARY KEY,

    admin_id INT
        REFERENCES admin(admin_id)
        ON DELETE SET NULL,

    target_table VARCHAR(50) NOT NULL,

    target_id INT,

    action_type VARCHAR(20) NOT NULL,

    action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    old_value TEXT,

    new_value TEXT
);


-- ============================================================
-- 10. ENROLLMENT
-- ============================================================

CREATE TABLE enrollment (
    enrollment_id SERIAL PRIMARY KEY,

    student_id INT NOT NULL
        REFERENCES student(student_id)
        ON DELETE CASCADE,

    course_id INT NOT NULL
        REFERENCES course(course_id)
        ON DELETE CASCADE,

    authorized_by_admin_id INT
        REFERENCES admin(admin_id)
        ON DELETE SET NULL,

    academic_year VARCHAR(20) NOT NULL,

    term VARCHAR(20) NOT NULL,

    enrolled_on DATE DEFAULT CURRENT_DATE,

    status VARCHAR(20) DEFAULT 'enrolled',

    UNIQUE(student_id, course_id, academic_year, term)
);


-- ============================================================
-- 11. EXAM
-- ============================================================

CREATE TABLE exam (
    exam_id SERIAL PRIMARY KEY,

    enrollment_id INT NOT NULL
        REFERENCES enrollment(enrollment_id)
        ON DELETE CASCADE,

    exam_type VARCHAR(50) NOT NULL,

    exam_date DATE,

    total_marks DECIMAL(6,2) NOT NULL,

    obtained_marks DECIMAL(6,2),

    grade VARCHAR(5),

    remarks TEXT,

    CONSTRAINT chk_obtained_marks
        CHECK (obtained_marks >= 0),

    CONSTRAINT chk_marks
        CHECK (obtained_marks <= total_marks)
);


-- ============================================================
-- 12. PAYMENT
-- ============================================================

CREATE TABLE payment (
    payment_id SERIAL PRIMARY KEY,

    student_id INT NOT NULL
        REFERENCES student(student_id)
        ON DELETE CASCADE,

    academic_year VARCHAR(20) NOT NULL,

    term VARCHAR(20) NOT NULL,

    payment_type VARCHAR(50) NOT NULL,

    amount DECIMAL(12,2) NOT NULL,

    paid_on DATE DEFAULT CURRENT_DATE,

    status VARCHAR(20) DEFAULT 'paid',

    CONSTRAINT chk_payment_amount
        CHECK (amount >= 0)
);


-- ============================================================
-- 13. STUDENT REGISTRATION REQUESTS
-- ============================================================
-- This remains a temporary/request entity.
--
-- It does NOT create USER until an administrator approves it.
-- ============================================================

CREATE TABLE student_registration_requests (
    request_id SERIAL PRIMARY KEY,

    registration_no VARCHAR(50) UNIQUE,

    full_name VARCHAR(100) NOT NULL,

    email VARCHAR(100) NOT NULL,

    phone VARCHAR(20),

    date_of_birth DATE,

    program_id INT
        REFERENCES program(program_id),

    password_hash VARCHAR(255) NOT NULL,

    status VARCHAR(20) DEFAULT 'pending',

    requested_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    reviewed_by_admin_id INT
        REFERENCES admin(admin_id),

    reviewed_on TIMESTAMP,

    rejection_reason TEXT
);


-- ============================================================
-- 14. COURSE REGISTRATION REQUESTS
-- ============================================================

CREATE TABLE course_registration_requests (
    request_id SERIAL PRIMARY KEY,

    student_id INT
        REFERENCES student(student_id)
        ON DELETE CASCADE,

    course_id INT
        REFERENCES course(course_id)
        ON DELETE CASCADE,

    academic_year VARCHAR(20) NOT NULL,

    term VARCHAR(20) NOT NULL,

    status VARCHAR(20) DEFAULT 'pending',

    requested_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    reviewed_by_admin_id INT
        REFERENCES admin(admin_id),

    reviewed_on TIMESTAMP,

    rejection_reason TEXT,

    UNIQUE(
        student_id,
        course_id,
        academic_year,
        term,
        status
    )
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_users_role
    ON users(role);

CREATE INDEX idx_users_status
    ON users(status);

CREATE INDEX idx_users_email
    ON users(email);

CREATE INDEX idx_admin_user
    ON admin(user_id);

CREATE INDEX idx_faculty_user
    ON faculty(user_id);

CREATE INDEX idx_faculty_department
    ON faculty(department_id);

CREATE INDEX idx_student_user
    ON student(user_id);

CREATE INDEX idx_student_program
    ON student(program_id);

CREATE INDEX idx_student_advisor
    ON student(advisor_id);

CREATE INDEX idx_course_program
    ON course(program_id);

CREATE INDEX idx_course_faculty
    ON course(faculty_id);

CREATE INDEX idx_enrollment_student
    ON enrollment(student_id);

CREATE INDEX idx_enrollment_course
    ON enrollment(course_id);

CREATE INDEX idx_exam_enrollment
    ON exam(enrollment_id);

CREATE INDEX idx_scholarship_student
    ON scholarship(student_id);

CREATE INDEX idx_payment_student
    ON payment(student_id);

CREATE INDEX idx_admin_action_admin
    ON admin_action_log(admin_id);

CREATE INDEX idx_admin_action_timestamp
    ON admin_action_log(action_timestamp);

CREATE INDEX idx_registration_status
    ON student_registration_requests(status);

CREATE INDEX idx_registration_email
    ON student_registration_requests(email);


-- ============================================================
-- END OF SCHEMA
-- ============================================================