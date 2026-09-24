const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Fresh/demo database only.
// Run after db:init and BEFORE db:migrate.
// WARNING: TRUNCATE below deletes existing data.
// Courses are not seeded here: after db:migrate, load the catalog
// with db:seed-catalog (or the full demo with db:seed-demo).

async function seedDatabase() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'edubase',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  });

  try {
    // Clear sample data and reset independent table sequences.
    await pool.query(`
      TRUNCATE TABLE
        course_registration_requests,
        admin_action_log,
        payment,
        exam,
        enrollment,
        scholarship,
        student_registration_requests,
        student,
        course,
        faculty,
        admin,
        users,
        program,
        department
      RESTART IDENTITY CASCADE
    `);

    console.log('Cleared existing data');

    // Departments
    await pool.query(`
      INSERT INTO department (
        department_name,
        office_location,
        phone
      )
      VALUES
        (
          'Computer Science & Engineering',
          'Building A, Room 101',
          '1234'
        ),
        (
          'Electrical & Electronic Engineering',
          'Building B, Room 201',
          '1235'
        ),
        (
          'Mechanical Engineering',
          'Building C, Room 301',
          '1236'
        ),
        (
          'Civil Engineering',
          'Building D, Room 401',
          '1237'
        ),
        (
          'Business Administration',
          'Building E, Room 501',
          '1238'
        )
    `);

    console.log('Seeded departments');

    // Programs
    await pool.query(`
      INSERT INTO program (
        department_id,
        program_name,
        degree_level,
        duration_years,
        total_credits
      )
      VALUES
        (1, 'B.Sc. in Computer Science', 'Bachelor', 4, 160.00),
        (1, 'M.Sc. in Computer Science', 'Master', 2, 40.00),
        (2, 'B.Sc. in Electrical Engineering', 'Bachelor', 4, 160.00),
        (3, 'B.Sc. in Mechanical Engineering', 'Bachelor', 4, 160.00),
        (4, 'B.Sc. in Civil Engineering', 'Bachelor', 4, 160.00),
        (5, 'BBA', 'Bachelor', 4, 140.00)
    `);

    console.log('Seeded programs');

    // Demo password only. Change default passwords before deployment.
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Faculty parent accounts
    await pool.query(`
      INSERT INTO users (
        username,
        email,
        password_hash,
        full_name,
        phone,
        role,
        status
      )
      VALUES
        (
          'ahmad', 'ahmad@university.edu', $1,
          'Dr. Ahmad Hassan', '2001', 'faculty', 'active'
        ),
        (
          'fatima', 'fatima@university.edu', $1,
          'Dr. Fatima Begum', '2002', 'faculty', 'active'
        ),
        (
          'karim', 'karim@university.edu', $1,
          'Mr. Karim Rahman', '2003', 'faculty', 'active'
        ),
        (
          'rahman', 'rali@university.edu', $1,
          'Dr. Rahman Ali', '2004', 'faculty', 'active'
        ),
        (
          'nasrin', 'nasrin@university.edu', $1,
          'Ms. Nasrin Akter', '2005', 'faculty', 'active'
        ),
        (
          'khan', 'khan@university.edu', $1,
          'Dr. Khan Mohammad', '2006', 'faculty', 'active'
        ),
        (
          'sultana', 'sultana@university.edu', $1,
          'Dr. Sultana Parvin', '2007', 'faculty', 'active'
        ),
        (
          'jabbar', 'jabbar@university.edu', $1,
          'Mr. Jabbar Ahmed', '2008', 'faculty', 'active'
        )
    `, [hashedPassword]);

    console.log('Created faculty users');

    // Faculty subtypes.
    // faculty_id is allocated by its own SERIAL sequence.
    // user_id links each faculty record to its parent user.
    await pool.query(`
      INSERT INTO faculty (
        user_id,
        department_id,
        designation,
        phone
      )
      SELECT
        u.user_id,
        d.department_id,
        x.designation,
        u.phone
      FROM users u
      JOIN (
        VALUES
          ('ahmad', 'Professor', 1),
          ('fatima', 'Associate Professor', 1),
          ('karim', 'Lecturer', 1),
          ('rahman', 'Professor', 2),
          ('nasrin', 'Assistant Professor', 2),
          ('khan', 'Professor', 3),
          ('sultana', 'Professor', 5),
          ('jabbar', 'Lecturer', 5)
      ) AS x(username, designation, department_id)
        ON u.username = x.username
      JOIN department d
        ON d.department_id = x.department_id
      ORDER BY u.user_id
    `);

    console.log('Seeded faculty');

    // Four initial administrator parent accounts
    await pool.query(`
      INSERT INTO users (
        username,
        email,
        password_hash,
        full_name,
        role,
        status
      )
      VALUES
        (
          'admin',
          'admin@university.edu',
          $1,
          'System Administrator',
          'admin',
          'active'
        ),
        (
          'registrar',
          'registrar@university.edu',
          $1,
          'University Registrar',
          'admin',
          'active'
        ),
        (
          'finance',
          'finance@university.edu',
          $1,
          'Finance Officer',
          'admin',
          'active'
        ),
        (
          'academic',
          'academic@university.edu',
          $1,
          'Academic Officer',
          'admin',
          'active'
        )
    `, [hashedPassword]);

    console.log('Created 4 admin users');

    // Administrator subtypes.
    // admin_id is independent of user_id.
    await pool.query(`
      INSERT INTO admin (
        user_id,
        role,
        status
      )
      SELECT
        u.user_id,
        CASE u.username
          WHEN 'admin' THEN 'superadmin'
          WHEN 'registrar' THEN 'registrar'
          WHEN 'finance' THEN 'finance'
          WHEN 'academic' THEN 'academic'
        END,
        'active'
      FROM users u
      WHERE u.role = 'admin'
      ORDER BY u.user_id
    `);

    console.log('Seeded admin records');

    // Student parent accounts
    await pool.query(`
      INSERT INTO users (
        username,
        email,
        password_hash,
        full_name,
        phone,
        date_of_birth,
        role,
        status
      )
      VALUES
        (
          'CSE2021001', 'rafiq@student.edu', $1,
          'Rafiq Islam', '3001', '2000-05-15',
          'student', 'active'
        ),
        (
          'CSE2021002', 'jahanara@student.edu', $1,
          'Jahanara Begum', '3002', '2001-03-20',
          'student', 'active'
        ),
        (
          'CSE2022001', 'imran@student.edu', $1,
          'Imran Khan', '3003', '2002-08-10',
          'student', 'active'
        ),
        (
          'CSE2022002', 'nusrat@student.edu', $1,
          'Nusrat Jahan', '3004', '2002-12-25',
          'student', 'active'
        ),
        (
          'CSE2023001', 'arif@student.edu', $1,
          'Arif Rahman', '3005', '2003-06-18',
          'student', 'active'
        ),
        (
          'EEE2021001', 'tanvir@student.edu', $1,
          'Tanvir Ahmed', '3006', '2001-02-14',
          'student', 'active'
        ),
        (
          'BBA2022001', 'sabina@student.edu', $1,
          'Sabina Yasmin', '3007', '2002-09-30',
          'student', 'active'
        )
    `, [hashedPassword]);

    console.log('Created student users');

    // Student subtypes.
    // student_id is allocated independently from user_id.
    //
    // password_hash is included because this seed runs against
    // the original base schema BEFORE the migration removes
    // that duplicate column from student.
    await pool.query(`
      INSERT INTO student (
        user_id,
        program_id,
        advisor_id,
        verified_by_admin_id,
        registration_no,
        full_name,
        email,
        phone,
        date_of_birth,
        admission_date,
        current_status,
        current_cgpa,
        password_hash
      )
      SELECT
        u.user_id,
        x.program_id,
        x.advisor_id,
        x.verified_by_admin_id,
        x.registration_no,
        u.full_name,
        u.email,
        u.phone,
        u.date_of_birth,
        x.admission_date,
        'active',
        x.current_cgpa,
        u.password_hash
      FROM users u
      JOIN (
        VALUES
          ('CSE2021001', 1, 1, 1, 'CSE2021001', '2021-09-01'::DATE, 3.50),
          ('CSE2021002', 1, 1, 1, 'CSE2021002', '2021-09-01'::DATE, 3.75),
          ('CSE2022001', 1, 2, 1, 'CSE2022001', '2022-09-01'::DATE, 3.20),
          ('CSE2022002', 1, 2, 1, 'CSE2022002', '2022-09-01'::DATE, 3.80),
          ('CSE2023001', 1, 3, 2, 'CSE2023001', '2023-09-01'::DATE, 3.45),
          ('EEE2021001', 3, 4, 1, 'EEE2021001', '2021-09-01'::DATE, 3.10),
          ('BBA2022001', 6, 7, 2, 'BBA2022001', '2022-09-01'::DATE, 3.60)
      ) AS x(
        username,
        program_id,
        advisor_id,
        verified_by_admin_id,
        registration_no,
        admission_date,
        current_cgpa
      )
        ON u.username = x.username
      ORDER BY u.user_id
    `);

    console.log('Seeded students');

    // Scholarships
    await pool.query(`
      INSERT INTO scholarship (
        student_id,
        scholarship_name,
        award_type,
        amount,
        awarded_on,
        valid_until,
        status
      )
      VALUES
        (
          1, 'Merit Scholarship', 'Academic Excellence',
          50000.00, '2022-01-15', '2024-12-31', 'active'
        ),
        (
          2, 'Talent Scholarship', 'Sports',
          25000.00, '2022-06-01', '2023-05-31', 'expired'
        ),
        (
          4, 'Need-based Grant', 'Financial Aid',
          30000.00, '2023-01-10', '2025-12-31', 'active'
        ),
        (
          7, 'Merit Scholarship', 'Academic Excellence',
          40000.00, '2023-01-15', '2024-12-31', 'active'
        )
    `);

    console.log('Seeded scholarships');

    // Payments
    await pool.query(`
      INSERT INTO payment (
        student_id,
        academic_year,
        term,
        payment_type,
        amount,
        paid_on,
        status
      )
      VALUES
        (
          1, '2021-2022', 'Fall', 'Tuition Fee',
          50000.00, '2021-08-25', 'paid'
        ),
        (
          1, '2022-2023', 'Spring', 'Tuition Fee',
          50000.00, '2022-01-20', 'paid'
        ),
        (
          2, '2021-2022', 'Fall', 'Tuition Fee',
          50000.00, '2021-08-26', 'paid'
        ),
        (
          2, '2022-2023', 'Spring', 'Tuition Fee',
          50000.00, '2022-01-22', 'paid'
        ),
        (
          3, '2022-2023', 'Fall', 'Tuition Fee',
          50000.00, '2022-08-28', 'paid'
        ),
        (
          4, '2022-2023', 'Fall', 'Tuition Fee',
          50000.00, '2022-08-30', 'paid'
        ),
        (
          5, '2023-2024', 'Fall', 'Tuition Fee',
          55000.00, '2023-08-25', 'paid'
        ),
        (
          6, '2021-2022', 'Fall', 'Tuition Fee',
          45000.00, '2021-08-27', 'paid'
        ),
        (
          7, '2022-2023', 'Fall', 'Tuition Fee',
          40000.00, '2022-08-29', 'paid'
        )
    `);

    console.log('Seeded payments');

    // Administrative activity logs
    await pool.query(`
      INSERT INTO admin_action_log (
        admin_id,
        target_table,
        target_id,
        action_type,
        old_value,
        new_value
      )
      VALUES
        (
          1, 'student', 1, 'CREATE',
          NULL, 'Student Rafiq Islam admitted'
        ),
        (
          1, 'student', 2, 'CREATE',
          NULL, 'Student Jahanara Begum admitted'
        ),
        (
          2, 'student', 5, 'VERIFY',
          NULL, 'Student verified'
        )
    `);

    console.log('Seeded admin action logs');

    console.log('\nDatabase seeding completed successfully!');
    console.log('\nDefault Admin Credentials:');
    console.log('Username: admin      | Password: admin123');
    console.log('Username: registrar  | Password: admin123');
    console.log('Username: finance    | Password: admin123');
    console.log('Username: academic   | Password: admin123');
    console.log('\nDefault Student Password: admin123');
    console.log('Default Faculty Password: admin123');
  } catch (err) {
    console.error('Seeding failed:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

seedDatabase()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));