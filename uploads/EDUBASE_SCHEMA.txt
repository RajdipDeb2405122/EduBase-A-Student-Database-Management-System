-- EduBase Database Schema
-- Based on Student Database ERD with Administrative Authority Layer

-- Drop tables if exist (in reverse order of dependencies)
DROP TABLE IF EXISTS admin_action_log CASCADE;
DROP TABLE IF EXISTS payment CASCADE;
DROP TABLE IF EXISTS exam CASCADE;
DROP TABLE IF EXISTS enrollment CASCADE;
DROP TABLE IF EXISTS scholarship CASCADE;
DROP TABLE IF EXISTS student CASCADE;
DROP TABLE IF EXISTS course CASCADE;
DROP TABLE IF EXISTS faculty CASCADE;
DROP TABLE IF EXISTS admin CASCADE;
DROP TABLE IF EXISTS program CASCADE;
DROP TABLE IF EXISTS department CASCADE;

-- 1. DEPARTMENT - Academic departments
CREATE TABLE department (
    department_id SERIAL PRIMARY KEY,
    department_name VARCHAR(100) NOT NULL,
    office_location VARCHAR(100),
    phone VARCHAR(20)
);

-- 2. PROGRAM - Programs offered by departments
CREATE TABLE program (
    program_id SERIAL PRIMARY KEY,
    department_id INT NOT NULL REFERENCES department(department_id) ON DELETE RESTRICT,
    program_name VARCHAR(100) NOT NULL,
    degree_level VARCHAR(50) NOT NULL,
    duration_years INT NOT NULL,
    total_credits DECIMAL(6,2)
);

-- 3. FACULTY - Faculty members
CREATE TABLE faculty (
    faculty_id SERIAL PRIMARY KEY,
    department_id INT NOT NULL REFERENCES department(department_id) ON DELETE RESTRICT,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    designation VARCHAR(50),
    phone VARCHAR(20)
);

-- 4. ADMIN - Admin users for authority/authentication
CREATE TABLE admin (
    admin_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    status VARCHAR(20) DEFAULT 'active',
    last_login TIMESTAMP
);

-- 5. COURSE - Courses offered in programs
CREATE TABLE course (
    course_id SERIAL PRIMARY KEY,
    program_id INT NOT NULL REFERENCES program(program_id) ON DELETE RESTRICT,
    faculty_id INT REFERENCES faculty(faculty_id) ON DELETE SET NULL,
    course_code VARCHAR(20) UNIQUE NOT NULL,
    course_title VARCHAR(200) NOT NULL,
    credit_hours DECIMAL(4,2) NOT NULL,
    term_no INT NOT NULL,
    course_type VARCHAR(50),
    active BOOLEAN DEFAULT TRUE
);

-- 6. STUDENT - Core student entity
CREATE TABLE student (
    student_id SERIAL PRIMARY KEY,
    program_id INT NOT NULL REFERENCES program(program_id) ON DELETE RESTRICT,
    advisor_id INT REFERENCES faculty(faculty_id) ON DELETE SET NULL,
    verified_by_admin_id INT REFERENCES admin(admin_id) ON DELETE SET NULL,
    registration_no VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    admission_date DATE NOT NULL,
    current_status VARCHAR(20) DEFAULT 'active',
    current_cgpa DECIMAL(4,2) DEFAULT 0.00
);

-- 7. SCHOLARSHIP - Student scholarships
CREATE TABLE scholarship (
    scholarship_id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES student(student_id) ON DELETE CASCADE,
    scholarship_name VARCHAR(100) NOT NULL,
    award_type VARCHAR(50),
    amount DECIMAL(12,2),
    awarded_on DATE,
    valid_until DATE,
    status VARCHAR(20) DEFAULT 'active'
);

-- 8. ADMIN_ACTION_LOG - Audit trail for admin actions
CREATE TABLE admin_action_log (
    log_id SERIAL PRIMARY KEY,
    admin_id INT REFERENCES admin(admin_id) ON DELETE SET NULL,
    target_table VARCHAR(50) NOT NULL,
    target_id INT,
    action_type VARCHAR(20) NOT NULL,
    action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    old_value TEXT,
    new_value TEXT
);

-- 9. ENROLLMENT - Student-course enrollment bridge
CREATE TABLE enrollment (
    enrollment_id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES student(student_id) ON DELETE CASCADE,
    course_id INT NOT NULL REFERENCES course(course_id) ON DELETE CASCADE,
    authorized_by_admin_id INT REFERENCES admin(admin_id) ON DELETE SET NULL,
    academic_year VARCHAR(20) NOT NULL,
    term VARCHAR(20) NOT NULL,
    enrolled_on DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'enrolled',
    UNIQUE(student_id, course_id, academic_year, term)
);

-- 10. EXAM - Exam records tied to enrollment
CREATE TABLE exam (
    exam_id SERIAL PRIMARY KEY,
    enrollment_id INT NOT NULL REFERENCES enrollment(enrollment_id) ON DELETE CASCADE,
    exam_type VARCHAR(50) NOT NULL,
    exam_date DATE,
    total_marks DECIMAL(6,2) NOT NULL,
    obtained_marks DECIMAL(6,2),
    grade VARCHAR(5),
    remarks TEXT
);

-- 11. PAYMENT - Student payments
CREATE TABLE payment (
    payment_id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES student(student_id) ON DELETE CASCADE,
    academic_year VARCHAR(20) NOT NULL,
    term VARCHAR(20) NOT NULL,
    payment_type VARCHAR(50) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    paid_on DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'paid'
);

-- 12. STUDENT_REGISTRATION_REQUESTS - Pending student registrations
CREATE TABLE student_registration_requests (
    request_id SERIAL PRIMARY KEY,
    registration_no VARCHAR(50) UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    program_id INT REFERENCES program(program_id),
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    requested_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by_admin_id INT REFERENCES admin(admin_id),
    reviewed_on TIMESTAMP,
    rejection_reason TEXT
);


-- Create indexes for better query performance
CREATE INDEX idx_student_program ON student(program_id);
CREATE INDEX idx_student_advisor ON student(advisor_id);
CREATE INDEX idx_course_program ON course(program_id);
CREATE INDEX idx_course_faculty ON course(faculty_id);
CREATE INDEX idx_enrollment_student ON enrollment(student_id);
CREATE INDEX idx_enrollment_course ON enrollment(course_id);
CREATE INDEX idx_exam_enrollment ON exam(enrollment_id);
CREATE INDEX idx_scholarship_student ON scholarship(student_id);
CREATE INDEX idx_payment_student ON payment(student_id);
CREATE INDEX idx_admin_action_admin ON admin_action_log(admin_id);
CREATE INDEX idx_admin_action_timestamp ON admin_action_log(action_timestamp);
CREATE INDEX idx_registration_status ON student_registration_requests(status);
CREATE INDEX idx_registration_email ON student_registration_requests(email);

-- Constraints
ALTER TABLE student ADD CONSTRAINT chk_cgpa CHECK (current_cgpa >= 0 AND current_cgpa <= 4.00);
ALTER TABLE exam ADD CONSTRAINT chk_obtained_marks CHECK (obtained_marks >= 0);
ALTER TABLE exam ADD CONSTRAINT chk_marks CHECK (obtained_marks <= total_marks);
ALTER TABLE payment ADD CONSTRAINT chk_payment_amount CHECK (amount >= 0);
ALTER TABLE scholarship ADD CONSTRAINT chk_scholarship_amount CHECK (amount >= 0);
