const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function seedDatabase() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'edubase',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    // Clear existing data
    await pool.query('TRUNCATE TABLE admin_action_log, payment, exam, enrollment, scholarship, student, course, faculty, admin, program, department CASCADE');
    console.log('✅ Cleared existing data');

    // 1. Seed Departments
    await pool.query(`
      INSERT INTO department (department_name, office_location, phone) VALUES
      ('Computer Science & Engineering', 'Building A, Room 101', '1234'),
      ('Electrical & Electronic Engineering', 'Building B, Room 201', '1235'),
      ('Mechanical Engineering', 'Building C, Room 301', '1236'),
      ('Civil Engineering', 'Building D, Room 401', '1237'),
      ('Business Administration', 'Building E, Room 501', '1238')
    `);
    console.log('✅ Seeded departments');

    // 2. Seed Programs
    await pool.query(`
      INSERT INTO program (department_id, program_name, degree_level, duration_years, total_credits) VALUES
      (1, 'B.Sc. in Computer Science', 'Bachelor', 4, 160.00),
      (1, 'M.Sc. in Computer Science', 'Master', 2, 40.00),
      (2, 'B.Sc. in Electrical Engineering', 'Bachelor', 4, 160.00),
      (3, 'B.Sc. in Mechanical Engineering', 'Bachelor', 4, 160.00),
      (4, 'B.Sc. in Civil Engineering', 'Bachelor', 4, 160.00),
      (5, 'BBA', 'Bachelor', 4, 140.00)
    `);
    console.log('✅ Seeded programs');

    // 3. Seed Faculty
    await pool.query(`
      INSERT INTO faculty (department_id, full_name, email, designation, phone) VALUES
      (1, 'Dr. Ahmad Hassan', 'ahmad@university.edu', 'Professor', '2001'),
      (1, 'Dr. Fatima Begum', 'fatima@university.edu', 'Associate Professor', '2002'),
      (1, 'Mr. Karim Rahman', 'karim@university.edu', 'Lecturer', '2003'),
      (2, 'Dr. Rahman Ali', 'rali@university.edu', 'Professor', '2004'),
      (2, 'Ms. Nasrin Akter', 'nasrin@university.edu', 'Assistant Professor', '2005'),
      (3, 'Dr. Khan Mohammad', 'khan@university.edu', 'Professor', '2006'),
      (5, 'Dr. Sultana Parvin', 'sultana@university.edu', 'Professor', '2007'),
      (5, 'Mr. Jabbar Ahmed', 'jabbar@university.edu', 'Lecturer', '2008')
    `);
    console.log('✅ Seeded faculty');

    // 4. Seed Admin (password: admin123)
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await pool.query(`
      INSERT INTO admin (username, password_hash, full_name, email, role, status) VALUES
      ('admin', $1, 'System Administrator', 'admin@university.edu', 'superadmin', 'active'),
      ('registrar', $1, 'University Registrar', 'registrar@university.edu', 'registrar', 'active'),
      ('finance', $1, 'Finance Officer', 'finance@university.edu', 'finance', 'active')
    `, [hashedPassword]);
    console.log('✅ Seeded admin users');

    // 5. Seed Courses
    await pool.query(`
      INSERT INTO course (program_id, faculty_id, course_code, course_title, credit_hours, term_no, course_type, active) VALUES
      (1, 1, 'CSE101', 'Introduction to Programming', 3.00, 1, 'Core', TRUE),
      (1, 2, 'CSE102', 'Data Structures', 4.00, 2, 'Core', TRUE),
      (1, 3, 'CSE201', 'Algorithms', 3.00, 3, 'Core', TRUE),
      (1, 1, 'CSE301', 'Database Systems', 3.00, 5, 'Core', TRUE),
      (1, 2, 'CSE302', 'Operating Systems', 3.00, 5, 'Core', TRUE),
      (1, 3, 'CSE401', 'Software Engineering', 3.00, 7, 'Core', TRUE),
      (1, NULL, 'CSE450', 'Capstone Project', 6.00, 8, 'Project', TRUE),
      (2, 1, 'CSE501', 'Advanced Algorithms', 3.00, 1, 'Core', TRUE),
      (3, 4, 'EEE101', 'Circuit Theory', 4.00, 1, 'Core', TRUE),
      (6, 7, 'BBA101', 'Principles of Management', 3.00, 1, 'Core', TRUE)
    `);
    console.log('✅ Seeded courses');

    // 6. Seed Students
    await pool.query(`
      INSERT INTO student (program_id, advisor_id, verified_by_admin_id, registration_no, full_name, email, phone, date_of_birth, admission_date, current_status, current_cgpa) VALUES
      (1, 1, 1, 'CSE2021001', 'Rafiq Islam', 'rafiq@student.edu', '3001', '2000-05-15', '2021-09-01', 'active', 3.50),
      (1, 1, 1, 'CSE2021002', 'Jahanara Begum', 'jahanara@student.edu', '3002', '2001-03-20', '2021-09-01', 'active', 3.75),
      (1, 2, 1, 'CSE2022001', 'Imran Khan', 'imran@student.edu', '3003', '2002-08-10', '2022-09-01', 'active', 3.20),
      (1, 2, 1, 'CSE2022002', 'Nusrat Jahan', 'nusrat@student.edu', '3004', '2002-12-25', '2022-09-01', 'active', 3.80),
      (1, 3, 2, 'CSE2023001', 'Arif Rahman', 'arif@student.edu', '3005', '2003-06-18', '2023-09-01', 'active', 3.45),
      (3, 4, 1, 'EEE2021001', 'Tanvir Ahmed', 'tanvir@student.edu', '3006', '2001-02-14', '2021-09-01', 'active', 3.10),
      (6, 7, 2, 'BBA2022001', 'Sabina Yasmin', 'sabina@student.edu', '3007', '2002-09-30', '2022-09-01', 'active', 3.60)
    `);
    console.log('✅ Seeded students');

    // 7. Seed Enrollments
    await pool.query(`
      INSERT INTO enrollment (student_id, course_id, authorized_by_admin_id, academic_year, term, status) VALUES
      (1, 1, 1, '2021-2022', 'Fall', 'enrolled'),
      (1, 2, 1, '2022-2023', 'Spring', 'enrolled'),
      (1, 3, 1, '2022-2023', 'Fall', 'enrolled'),
      (2, 1, 1, '2021-2022', 'Fall', 'enrolled'),
      (2, 2, 1, '2022-2023', 'Spring', 'enrolled'),
      (3, 2, 1, '2022-2023', 'Fall', 'enrolled'),
      (3, 3, 1, '2023-2024', 'Spring', 'enrolled'),
      (4, 2, 1, '2022-2023', 'Fall', 'enrolled'),
      (4, 3, 1, '2023-2024', 'Spring', 'enrolled'),
      (5, 5, 2, '2023-2024', 'Fall', 'enrolled'),
      (6, 9, 1, '2021-2022', 'Fall', 'enrolled'),
      (7, 10, 2, '2022-2023', 'Fall', 'enrolled')
    `);
    console.log('✅ Seeded enrollments');

    // 8. Seed Exams
    await pool.query(`
      INSERT INTO exam (enrollment_id, exam_type, exam_date, total_marks, obtained_marks, grade, remarks) VALUES
      (1, 'Midterm', '2021-11-15', 100.00, 75.00, 'B+', 'Good performance'),
      (1, 'Final', '2021-12-20', 100.00, 82.00, 'A-', 'Excellent'),
      (2, 'Midterm', '2022-04-10', 100.00, 68.00, 'B', 'Average'),
      (2, 'Final', '2022-05-15', 100.00, 78.00, 'B+', 'Good'),
      (3, 'Midterm', '2022-11-12', 100.00, 70.00, 'B', 'Satisfactory'),
      (4, 'Midterm', '2021-11-15', 100.00, 88.00, 'A', 'Outstanding'),
      (4, 'Final', '2021-12-20', 100.00, 92.00, 'A+', 'Excellent'),
      (5, 'Midterm', '2022-04-10', 100.00, 85.00, 'A-', 'Very Good'),
      (6, 'Midterm', '2022-11-12', 100.00, 65.00, 'C+', 'Needs improvement'),
      (7, 'Midterm', '2023-04-08', 100.00, 72.00, 'B', 'Satisfactory')
    `);
    console.log('✅ Seeded exams');

    // 9. Seed Scholarships
    await pool.query(`
      INSERT INTO scholarship (student_id, scholarship_name, award_type, amount, awarded_on, valid_until, status) VALUES
      (1, 'Merit Scholarship', 'Academic Excellence', 50000.00, '2022-01-15', '2024-12-31', 'active'),
      (2, 'Talent Scholarship', 'Sports', 25000.00, '2022-06-01', '2023-05-31', 'expired'),
      (4, 'Need-based Grant', 'Financial Aid', 30000.00, '2023-01-10', '2025-12-31', 'active'),
      (7, 'Merit Scholarship', 'Academic Excellence', 40000.00, '2023-01-15', '2024-12-31', 'active')
    `);
    console.log('✅ Seeded scholarships');

    // 10. Seed Payments
    await pool.query(`
      INSERT INTO payment (student_id, academic_year, term, payment_type, amount, paid_on, status) VALUES
      (1, '2021-2022', 'Fall', 'Tuition Fee', 50000.00, '2021-08-25', 'paid'),
      (1, '2022-2023', 'Spring', 'Tuition Fee', 50000.00, '2022-01-20', 'paid'),
      (2, '2021-2022', 'Fall', 'Tuition Fee', 50000.00, '2021-08-26', 'paid'),
      (2, '2022-2023', 'Spring', 'Tuition Fee', 50000.00, '2022-01-22', 'paid'),
      (3, '2022-2023', 'Fall', 'Tuition Fee', 50000.00, '2022-08-28', 'paid'),
      (4, '2022-2023', 'Fall', 'Tuition Fee', 50000.00, '2022-08-30', 'paid'),
      (5, '2023-2024', 'Fall', 'Tuition Fee', 55000.00, '2023-08-25', 'paid'),
      (6, '2021-2022', 'Fall', 'Tuition Fee', 45000.00, '2021-08-27', 'paid'),
      (7, '2022-2023', 'Fall', 'Tuition Fee', 40000.00, '2022-08-29', 'paid')
    `);
    console.log('✅ Seeded payments');

    // 11. Seed Admin Action Logs
    await pool.query(`
      INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, old_value, new_value) VALUES
      (1, 'student', 1, 'CREATE', NULL, 'Student Rafiq Islam admitted'),
      (1, 'student', 2, 'CREATE', NULL, 'Student Jahanara Begum admitted'),
      (1, 'enrollment', 1, 'AUTHORIZE', NULL, 'Enrollment authorized'),
      (2, 'student', 5, 'VERIFY', NULL, 'Student verified'),
      (1, 'enrollment', 10, 'AUTHORIZE', NULL, 'Enrollment authorized')
    `);
    console.log('✅ Seeded admin action logs');

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📋 Default Admin Credentials:');
    console.log('   Username: admin    | Password: admin123');
    console.log('   Username: registrar | Password: admin123');
    console.log('   Username: finance   | Password: admin123');

  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

seedDatabase()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
