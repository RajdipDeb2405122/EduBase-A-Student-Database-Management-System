/**
 * Rebuild all sample data.
 *
 *   npm run db:reseed
 *
 * KEPT (accounts and their linked academic history):
 *   - Every administrator account
 *   - Teacher  : abdurrahman@university.edu
 *   - Student  : registration 2405122 (rajdiptadeb2006@gmail.com)
 *
 * EVERYTHING ELSE is deleted and replaced with a fresh set of at
 * least ten sample rows per entity. No other login stays valid:
 * new people must register again through the normal request flow.
 *
 * Run this AFTER db:migrate (it expects the migrated schema).
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const KEEP_FACULTY_EMAIL = 'abdurrahman@university.edu';
const KEEP_STUDENT_REG = '2405122';
const KEEP_STUDENT_EMAIL = 'rajdiptadeb2006@gmail.com';
const DEFAULT_PASSWORD = 'admin123';

// Tables carrying business-rule triggers that would reject bulk
// sample data (fee guards, immutable receipts, exam guards).
const GUARDED_TABLES = [
  'enrollment',
  'course_payment',
  'exam',
  'exam_result',
  'course_teacher'
];

const DEPARTMENTS = [
  ['Computer Science & Engineering', 'Building A, Room 101', '01710000101'],
  ['Electrical & Electronic Engineering', 'Building B, Room 201', '01710000102'],
  ['Mechanical Engineering', 'Building C, Room 301', '01710000103'],
  ['Civil Engineering', 'Building D, Room 401', '01710000104'],
  ['Business Administration', 'Building E, Room 501', '01710000105'],
  ['Economics', 'Building F, Room 601', '01710000106'],
  ['English', 'Building G, Room 701', '01710000107'],
  ['Mathematics', 'Building H, Room 801', '01710000108'],
  ['Physics', 'Building I, Room 901', '01710000109'],
  ['Pharmacy', 'Building J, Room 1001', '01710000110'],
  ['Law', 'Building K, Room 1101', '01710000111'],
  ['Architecture', 'Building L, Room 1201', '01710000112']
];

const PROGRAMS = [
  ['Computer Science & Engineering', 'B.Sc. in Computer Science & Engineering', 'Bachelor', 4, 160],
  ['Computer Science & Engineering', 'M.Sc. in Computer Science', 'Master', 2, 40],
  ['Electrical & Electronic Engineering', 'B.Sc. in Electrical & Electronic Engineering', 'Bachelor', 4, 160],
  ['Mechanical Engineering', 'B.Sc. in Mechanical Engineering', 'Bachelor', 4, 160],
  ['Civil Engineering', 'B.Sc. in Civil Engineering', 'Bachelor', 4, 160],
  ['Business Administration', 'Bachelor of Business Administration', 'Bachelor', 4, 140],
  ['Business Administration', 'Master of Business Administration', 'Master', 2, 60],
  ['Economics', 'B.Sc. in Economics', 'Bachelor', 4, 130],
  ['English', 'B.A. in English', 'Bachelor', 4, 128],
  ['Mathematics', 'B.Sc. in Mathematics', 'Bachelor', 4, 132],
  ['Physics', 'B.Sc. in Physics', 'Bachelor', 4, 136],
  ['Pharmacy', 'B.Pharm', 'Bachelor', 4, 165],
  ['Law', 'LL.B. (Hons)', 'Bachelor', 4, 140],
  ['Architecture', 'B.Arch', 'Bachelor', 5, 190]
];

// username, full name, email, phone, designation, department
const FACULTY = [
  ['tahmina', 'Dr. Tahmina Chowdhury', 'tahmina@university.edu', '01810000201', 'Professor', 'Computer Science & Engineering'],
  ['shakil', 'Dr. Shakil Mahmud', 'shakil@university.edu', '01810000202', 'Associate Professor', 'Computer Science & Engineering'],
  ['nadia', 'Ms. Nadia Sultana', 'nadia@university.edu', '01810000203', 'Lecturer', 'Computer Science & Engineering'],
  ['mizanur', 'Dr. Mizanur Rahman', 'mizanur@university.edu', '01810000204', 'Professor', 'Electrical & Electronic Engineering'],
  ['farhana', 'Ms. Farhana Yeasmin', 'farhana@university.edu', '01810000205', 'Assistant Professor', 'Electrical & Electronic Engineering'],
  ['rashed', 'Dr. Rashedul Haque', 'rashed@university.edu', '01810000206', 'Professor', 'Mechanical Engineering'],
  ['sabbir', 'Mr. Sabbir Hossain', 'sabbir@university.edu', '01810000207', 'Lecturer', 'Civil Engineering'],
  ['ruma', 'Dr. Ruma Akter', 'ruma@university.edu', '01810000208', 'Professor', 'Business Administration'],
  ['jamil', 'Mr. Jamil Uddin', 'jamil@university.edu', '01810000209', 'Lecturer', 'Economics'],
  ['sharmin', 'Dr. Sharmin Nahar', 'sharmin@university.edu', '01810000210', 'Associate Professor', 'Mathematics'],
  ['arefin', 'Mr. Arefin Kabir', 'arefin@university.edu', '01810000211', 'Lecturer', 'Physics'],
  ['lubna', 'Dr. Lubna Ferdous', 'lubna@university.edu', '01810000212', 'Professor', 'English']
];

// code, title, credits, term, type, program
const COURSES = [
  ['CSE1101', 'Structured Programming', 3, 1, 'Core', 'B.Sc. in Computer Science & Engineering'],
  ['CSE1203', 'Discrete Mathematics', 3, 2, 'Core', 'B.Sc. in Computer Science & Engineering'],
  ['CSE2101', 'Data Structures', 4, 3, 'Core', 'B.Sc. in Computer Science & Engineering'],
  ['CSE2203', 'Algorithms', 3, 4, 'Core', 'B.Sc. in Computer Science & Engineering'],
  ['CSE3101', 'Database Management Systems', 3, 5, 'Core', 'B.Sc. in Computer Science & Engineering'],
  ['CSE3203', 'Operating Systems', 3, 6, 'Core', 'B.Sc. in Computer Science & Engineering'],
  ['CSE4101', 'Software Engineering', 3, 7, 'Core', 'B.Sc. in Computer Science & Engineering'],
  ['CSE4203', 'Machine Learning', 3, 8, 'Elective', 'B.Sc. in Computer Science & Engineering'],
  ['CSE5101', 'Advanced Algorithms', 3, 1, 'Core', 'M.Sc. in Computer Science'],
  ['EEE1101', 'Electrical Circuits', 4, 1, 'Core', 'B.Sc. in Electrical & Electronic Engineering'],
  ['EEE2101', 'Digital Electronics', 3, 3, 'Core', 'B.Sc. in Electrical & Electronic Engineering'],
  ['ME1101', 'Engineering Mechanics', 3, 1, 'Core', 'B.Sc. in Mechanical Engineering'],
  ['CE1101', 'Engineering Drawing', 3, 1, 'Core', 'B.Sc. in Civil Engineering'],
  ['BBA1101', 'Principles of Management', 3, 1, 'Core', 'Bachelor of Business Administration'],
  ['BBA2101', 'Financial Accounting', 3, 3, 'Core', 'Bachelor of Business Administration'],
  ['ECO1101', 'Microeconomics', 3, 1, 'Core', 'B.Sc. in Economics'],
  ['MAT1101', 'Calculus I', 3, 1, 'Core', 'B.Sc. in Mathematics'],
  ['ENG1101', 'Introduction to Literature', 3, 1, 'Core', 'B.A. in English']
];

// registration, name, email, phone, dob, admission, cgpa, program
const STUDENTS = [
  ['2405201', 'Anika Tabassum', 'anika.tabassum@student.edu', '01910000301', '2004-02-11', '2024-01-15', 3.72, 'B.Sc. in Computer Science & Engineering'],
  ['2405202', 'Tanjim Hasan', 'tanjim.hasan@student.edu', '01910000302', '2004-06-19', '2024-01-15', 3.41, 'B.Sc. in Computer Science & Engineering'],
  ['2405203', 'Sumaiya Islam', 'sumaiya.islam@student.edu', '01910000303', '2003-11-02', '2024-01-15', 3.88, 'B.Sc. in Computer Science & Engineering'],
  ['2405204', 'Fahim Shahriar', 'fahim.shahriar@student.edu', '01910000304', '2004-04-27', '2024-01-15', 3.15, 'B.Sc. in Computer Science & Engineering'],
  ['2305205', 'Rownak Jahan', 'rownak.jahan@student.edu', '01910000305', '2003-09-05', '2023-01-16', 3.60, 'B.Sc. in Computer Science & Engineering'],
  ['2305206', 'Mahin Sarker', 'mahin.sarker@student.edu', '01910000306', '2003-12-21', '2023-01-16', 2.95, 'B.Sc. in Electrical & Electronic Engineering'],
  ['2305207', 'Israt Jahan', 'israt.jahan@student.edu', '01910000307', '2003-07-14', '2023-01-16', 3.52, 'B.Sc. in Electrical & Electronic Engineering'],
  ['2205208', 'Nayeem Chowdhury', 'nayeem.chowdhury@student.edu', '01910000308', '2002-05-30', '2022-01-17', 3.33, 'B.Sc. in Mechanical Engineering'],
  ['2205209', 'Sadia Afrin', 'sadia.afrin@student.edu', '01910000309', '2002-03-08', '2022-01-17', 3.79, 'Bachelor of Business Administration'],
  ['2205210', 'Rifat Karim', 'rifat.karim@student.edu', '01910000310', '2002-10-12', '2022-01-17', 3.05, 'Bachelor of Business Administration'],
  ['2105211', 'Mehjabin Rahman', 'mehjabin.rahman@student.edu', '01910000311', '2001-08-23', '2021-01-18', 3.64, 'B.Sc. in Economics'],
  ['2105212', 'Shafayet Ullah', 'shafayet.ullah@student.edu', '01910000312', '2001-01-09', '2021-01-18', 3.21, 'B.Sc. in Mathematics']
];

const YEAR = '2024-2025';

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'edubase',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  });

  const db = await pool.connect();
  const password = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const one = async (sql, params = []) =>
    (await db.query(sql, params)).rows[0] || null;

  try {
    await db.query('BEGIN');

    for (const table of GUARDED_TABLES) {
      await db.query(
        `ALTER TABLE ${table} DISABLE TRIGGER USER`
      );
    }

    // ---------------------------------------------------------
    // 1. Locate the accounts that must survive
    // ---------------------------------------------------------
    const keptFaculty = await one(`
      SELECT f.faculty_id, f.user_id, f.department_id, u.full_name
      FROM faculty f
      JOIN users u ON u.user_id = f.user_id
      WHERE lower(btrim(u.email)) = lower($1)
    `, [KEEP_FACULTY_EMAIL]);

    const keptStudent = await one(`
      SELECT s.student_id, s.user_id, s.program_id, u.full_name
      FROM student s
      JOIN users u ON u.user_id = s.user_id
      WHERE s.registration_no = $1
         OR lower(btrim(u.email)) = lower($2)
    `, [KEEP_STUDENT_REG, KEEP_STUDENT_EMAIL]);

    if (!keptFaculty) {
      console.warn(
        `! Teacher ${KEEP_FACULTY_EMAIL} was not found — nothing to preserve for him.`
      );
    }

    if (!keptStudent) {
      console.warn(
        `! Student ${KEEP_STUDENT_REG} was not found — nothing to preserve for her/him.`
      );
    }

    const keepFacultyId = keptFaculty ? keptFaculty.faculty_id : null;
    const keepStudentId = keptStudent ? keptStudent.student_id : null;

    // ---------------------------------------------------------
    // 2. Remove every other sample record
    // ---------------------------------------------------------
    await db.query('DELETE FROM admin_action_log');
    await db.query('DELETE FROM student_registration_requests');
    await db.query('DELETE FROM faculty_registration_requests');

    await db.query(`
      DELETE FROM course_registration_requests
      WHERE student_id IS DISTINCT FROM $1
    `, [keepStudentId]);

    await db.query(`
      DELETE FROM course_payment
      WHERE enrollment_id IN (
        SELECT enrollment_id FROM enrollment
        WHERE student_id IS DISTINCT FROM $1
      )
    `, [keepStudentId]);

    await db.query(
      'DELETE FROM exam_result WHERE student_id IS DISTINCT FROM $1',
      [keepStudentId]
    );

    await db.query(
      'DELETE FROM payment WHERE student_id IS DISTINCT FROM $1',
      [keepStudentId]
    );

    await db.query(
      'DELETE FROM scholarship WHERE student_id IS DISTINCT FROM $1',
      [keepStudentId]
    );

    await db.query(
      'DELETE FROM enrollment WHERE student_id IS DISTINCT FROM $1',
      [keepStudentId]
    );

    await db.query(`
      DELETE FROM exam x
      WHERE NOT EXISTS (
        SELECT 1 FROM exam_result r WHERE r.exam_id = x.exam_id
      )
    `);

    // Exams kept for the preserved student must point at a teacher
    // that still exists.
    if (keepFacultyId) {
      await db.query(
        'UPDATE exam SET faculty_id = $1 WHERE faculty_id <> $1',
        [keepFacultyId]
      );
    }

    await db.query(
      'DELETE FROM course_teacher WHERE faculty_id IS DISTINCT FROM $1',
      [keepFacultyId]
    );

    // Keep only courses still referenced by preserved history.
    await db.query(`
      DELETE FROM course c
      WHERE NOT EXISTS (
          SELECT 1 FROM enrollment e WHERE e.course_id = c.course_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM exam x WHERE x.course_id = c.course_id
        )
    `);

    if (keepFacultyId) {
      await db.query(
        'UPDATE student SET advisor_id = $1 WHERE advisor_id IS DISTINCT FROM $1',
        [keepFacultyId]
      );
    } else {
      await db.query('UPDATE student SET advisor_id = NULL');
    }

    await db.query(`
      DELETE FROM users
      WHERE role = 'student'
        AND user_id IS DISTINCT FROM $1
    `, [keptStudent ? keptStudent.user_id : null]);

    await db.query(`
      DELETE FROM users
      WHERE role = 'faculty'
        AND user_id IS DISTINCT FROM $1
    `, [keptFaculty ? keptFaculty.user_id : null]);

    await db.query(`
      DELETE FROM login_session
      WHERE user_id NOT IN (SELECT user_id FROM users)
    `);

    console.log('Cleared old sample data (preserved accounts kept)');

    // ---------------------------------------------------------
    // 3. Administrators (the four original accounts)
    // ---------------------------------------------------------
    const ADMINS = [
      ['admin', 'admin@university.edu', 'System Administrator', 'superadmin'],
      ['registrar', 'registrar@university.edu', 'University Registrar', 'registrar'],
      ['finance', 'finance@university.edu', 'Finance Officer', 'finance'],
      ['academic', 'academic@university.edu', 'Academic Officer', 'academic']
    ];

    for (const [username, email, fullName, adminRole] of ADMINS) {
      const user = await one(`
        INSERT INTO users (
          username, email, password_hash, full_name, role, status
        )
        VALUES ($1, $2, $3, $4, 'admin', 'active')
        ON CONFLICT (email) DO UPDATE
          SET status = 'active'
        RETURNING user_id
      `, [username, email, password, fullName]);

      await db.query(`
        INSERT INTO admin (user_id, role, status)
        VALUES ($1, $2, 'active')
        ON CONFLICT (user_id) DO UPDATE
          SET status = 'active'
      `, [user.user_id, adminRole]);
    }

    const admins = (await db.query(
      'SELECT admin_id FROM admin ORDER BY admin_id'
    )).rows.map(row => row.admin_id);

    const anAdmin = index => admins[index % admins.length];

    // ---------------------------------------------------------
    // 4. Departments and programs
    // ---------------------------------------------------------
    for (const [name, office, phone] of DEPARTMENTS) {
      await db.query(`
        INSERT INTO department (department_name, office_location, phone)
        SELECT $1, $2, $3
        WHERE NOT EXISTS (
          SELECT 1 FROM department WHERE department_name = $1
        )
      `, [name, office, phone]);
    }

    const departments = {};
    for (const row of (await db.query(
      'SELECT department_id, department_name FROM department'
    )).rows) {
      departments[row.department_name] = row.department_id;
    }

    for (const [dept, name, level, years, credits] of PROGRAMS) {
      await db.query(`
        INSERT INTO program (
          department_id, program_name, degree_level,
          duration_years, total_credits
        )
        SELECT $1, $2, $3, $4, $5
        WHERE NOT EXISTS (
          SELECT 1 FROM program WHERE program_name = $2
        )
      `, [departments[dept], name, level, years, credits]);
    }

    const programs = {};
    for (const row of (await db.query(
      'SELECT program_id, program_name FROM program'
    )).rows) {
      programs[row.program_name] = row.program_id;
    }

    console.log('Seeded departments and programs');

    // ---------------------------------------------------------
    // 5. Teachers
    // ---------------------------------------------------------
    const facultyByName = {};

    if (keptFaculty) {
      facultyByName[keptFaculty.full_name] = {
        faculty_id: keptFaculty.faculty_id,
        department_id: keptFaculty.department_id
      };
    }

    const facultyIds = [];

    for (const [
      username, fullName, email, phone, designation, dept
    ] of FACULTY) {
      const user = await one(`
        INSERT INTO users (
          username, email, password_hash, full_name,
          phone, role, status
        )
        VALUES ($1, $2, $3, $4, $5, 'faculty', 'active')
        RETURNING user_id
      `, [username, email, password, fullName, phone]);

      const row = await one(`
        INSERT INTO faculty (
          user_id, department_id, designation, phone, office_location
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING faculty_id, department_id
      `, [
        user.user_id,
        departments[dept],
        designation,
        phone,
        `${dept} office`
      ]);

      facultyByName[fullName] = row;
      facultyIds.push(row.faculty_id);
    }

    if (keepFacultyId) facultyIds.unshift(keepFacultyId);

    console.log(`Seeded ${FACULTY.length} teachers`);

    // ---------------------------------------------------------
    // 6. Courses (with M:N teaching assignments)
    // ---------------------------------------------------------
    const courseIds = [];

    for (const [
      code, title, credits, term, type, programName
    ] of COURSES) {
      const row = await one(`
        INSERT INTO course (
          program_id, course_code, course_title,
          credit_hours, term_no, course_type, active
        )
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        ON CONFLICT (course_code) DO NOTHING
        RETURNING course_id
      `, [
        programs[programName], code, title, credits, term, type
      ]);

      if (row) courseIds.push(row.course_id);
    }

    // Spread the courses over the teachers of the same department;
    // a few courses deliberately get two teachers.
    for (let index = 0; index < courseIds.length; index += 1) {
      const courseId = courseIds[index];

      const eligible = (await db.query(`
        SELECT f.faculty_id
        FROM faculty f
        JOIN program p ON p.department_id = f.department_id
        JOIN course c ON c.program_id = p.program_id
        WHERE c.course_id = $1
        ORDER BY f.faculty_id
      `, [courseId])).rows.map(row => row.faculty_id);

      if (!eligible.length) continue;

      const teachers = [eligible[index % eligible.length]];

      if (eligible.length > 1 && index % 3 === 0) {
        teachers.push(eligible[(index + 1) % eligible.length]);
      }

      for (const facultyId of new Set(teachers)) {
        await db.query(`
          INSERT INTO course_teacher (course_id, faculty_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [courseId, facultyId]);
      }

      await db.query(
        'UPDATE course SET faculty_id = $2 WHERE course_id = $1',
        [courseId, teachers[0]]
      );
    }

    console.log(`Seeded ${courseIds.length} courses`);

    // ---------------------------------------------------------
    // 7. Students
    // ---------------------------------------------------------
    const studentIds = [];

    for (let index = 0; index < STUDENTS.length; index += 1) {
      const [
        registration, fullName, email, phone,
        birth, admission, cgpa, programName
      ] = STUDENTS[index];

      const user = await one(`
        INSERT INTO users (
          username, email, password_hash, full_name,
          phone, date_of_birth, role, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'student', 'active')
        RETURNING user_id
      `, [registration, email, password, fullName, phone, birth]);

      const row = await one(`
        INSERT INTO student (
          user_id, program_id, advisor_id, verified_by_admin_id,
          registration_no, full_name, email, phone, date_of_birth,
          admission_date, current_status, current_cgpa
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',$11)
        RETURNING student_id
      `, [
        user.user_id,
        programs[programName],
        facultyIds[index % facultyIds.length] || null,
        anAdmin(index),
        registration,
        fullName,
        email,
        phone,
        birth,
        admission,
        cgpa
      ]);

      studentIds.push(row.student_id);
    }

    console.log(`Seeded ${studentIds.length} students`);

    // ---------------------------------------------------------
    // 8. Enrollments + paid course fees
    // ---------------------------------------------------------
    const enrollments = [];
    let receipt = 1000;

    for (let index = 0; index < studentIds.length; index += 1) {
      const studentId = studentIds[index];

      const eligible = (await db.query(`
        SELECT c.course_id
        FROM course c
        JOIN student s ON s.program_id = c.program_id
        WHERE s.student_id = $1 AND c.active
        ORDER BY c.term_no
        LIMIT 3
      `, [studentId])).rows.map(row => row.course_id);

      for (let slot = 0; slot < eligible.length; slot += 1) {
        const paid = !(index % 4 === 3 && slot === eligible.length - 1);

        const enrollment = await one(`
          INSERT INTO enrollment (
            student_id, course_id, authorized_by_admin_id,
            academic_year, term, enrolled_on, status, fee_required
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
          ON CONFLICT DO NOTHING
          RETURNING enrollment_id, course_id
        `, [
          studentId,
          eligible[slot],
          anAdmin(index + slot),
          YEAR,
          slot === 0 ? 'Spring' : slot === 1 ? 'Summer' : 'Fall',
          '2024-08-20',
          paid ? 'enrolled' : 'pending_payment'
        ]);

        if (!enrollment) continue;

        if (paid) {
          receipt += 1;

          await db.query(`
            INSERT INTO course_payment (
              enrollment_id, amount, currency,
              payment_mode, receipt_no, paid_at
            )
            VALUES ($1, 1000.00, 'BDT', 'demo', $2, $3)
          `, [
            enrollment.enrollment_id,
            `DEMO-${YEAR}-${receipt}`,
            '2024-08-25T10:00:00Z'
          ]);
        }

        enrollments.push({
          ...enrollment,
          student_id: studentId,
          paid,
          term: slot === 0 ? 'Spring' : slot === 1 ? 'Summer' : 'Fall'
        });
      }
    }

    console.log(`Seeded ${enrollments.length} enrollments`);

    // ---------------------------------------------------------
    // 9. Exams and results
    // ---------------------------------------------------------
    const paidEnrollments = enrollments.filter(item => item.paid);
    const byCourse = new Map();

    for (const item of paidEnrollments) {
      const key = `${item.course_id}:${item.term}`;
      if (!byCourse.has(key)) byCourse.set(key, []);
      byCourse.get(key).push(item);
    }

    let examCount = 0;

    for (const [key, group] of byCourse) {
      if (examCount >= 12) break;

      const courseId = group[0].course_id;

      const lead = await one(
        'SELECT faculty_id FROM course WHERE course_id = $1',
        [courseId]
      );

      if (!lead || !lead.faculty_id) continue;

      const type = examCount % 2 === 0 ? 'Midterm' : 'Final';

      const exam = await one(`
        INSERT INTO exam (
          course_id, faculty_id, academic_year, term,
          exam_type, exam_date, total_marks, published
        )
        VALUES ($1,$2,$3,$4,$5,$6,100.00,TRUE)
        RETURNING exam_id
      `, [
        courseId,
        lead.faculty_id,
        YEAR,
        key.split(':')[1],
        type,
        type === 'Midterm' ? '2024-10-12' : '2024-12-18'
      ]);

      for (let index = 0; index < group.length; index += 1) {
        const marks = 62 + ((index * 7 + examCount * 5) % 36);

        const grade =
          marks >= 90 ? 'A+' :
            marks >= 85 ? 'A' :
              marks >= 80 ? 'A-' :
                marks >= 75 ? 'B+' :
                  marks >= 70 ? 'B' :
                    marks >= 65 ? 'C+' : 'C';

        await db.query(`
          INSERT INTO exam_result (
            exam_id, student_id, enrollment_id,
            obtained_marks, grade, remarks
          )
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (exam_id, student_id) DO NOTHING
        `, [
          exam.exam_id,
          group[index].student_id,
          group[index].enrollment_id,
          marks,
          grade,
          marks >= 80 ? 'Very good' : 'Satisfactory'
        ]);
      }

      examCount += 1;
    }

    console.log(`Seeded ${examCount} exams with results`);

    // ---------------------------------------------------------
    // 10. Semester payments (historical records)
    // ---------------------------------------------------------
    for (let index = 0; index < studentIds.length; index += 1) {
      await db.query(`
        INSERT INTO payment (
          student_id, academic_year, term,
          payment_type, amount, paid_on, status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [
        studentIds[index],
        YEAR,
        index % 2 === 0 ? 'Spring' : 'Fall',
        index % 3 === 0 ? 'Tuition Fee'
          : index % 3 === 1 ? 'Semester Fee' : 'Lab Fee',
        index % 3 === 0 ? 45000 : index % 3 === 1 ? 18000 : 6500,
        `2024-0${(index % 8) + 1}-15`,
        index % 5 === 4 ? 'pending' : 'paid'
      ]);
    }

    console.log(`Seeded ${studentIds.length} semester payments`);

    // ---------------------------------------------------------
    // 11. Scholarships
    // ---------------------------------------------------------
    const SCHOLARSHIPS = [
      ['Merit Scholarship', 'Academic Excellence', 50000, 'active'],
      ['Dean\u2019s Award', 'Academic Excellence', 35000, 'active'],
      ['Need-based Grant', 'Financial Aid', 30000, 'active'],
      ['Sports Scholarship', 'Sports', 20000, 'active'],
      ['Research Fellowship', 'Research', 60000, 'active'],
      ['Freedom Fighter Quota', 'Government', 25000, 'active'],
      ['Female Student Grant', 'Financial Aid', 22000, 'active'],
      ['Tribal Student Grant', 'Government', 24000, 'expired'],
      ['Alumni Scholarship', 'Donor Funded', 28000, 'active'],
      ['Departmental Waiver', 'Tuition Waiver', 15000, 'expired'],
      ['Innovation Award', 'Research', 40000, 'active'],
      ['Community Service Award', 'Service', 18000, 'active']
    ];

    for (let index = 0; index < SCHOLARSHIPS.length; index += 1) {
      const [name, type, amount, status] = SCHOLARSHIPS[index];

      await db.query(`
        INSERT INTO scholarship (
          student_id, scholarship_name, award_type,
          amount, awarded_on, valid_until, status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [
        studentIds[index % studentIds.length],
        name,
        type,
        amount,
        '2024-02-01',
        status === 'expired' ? '2024-12-31' : '2026-12-31',
        status
      ]);
    }

    console.log(`Seeded ${SCHOLARSHIPS.length} scholarships`);

    // ---------------------------------------------------------
    // 12. Pending requests
    // ---------------------------------------------------------
    const APPLICANTS = [
      ['2505301', 'Zarin Tasnim', 'zarin.tasnim@student.edu', '01610000401', '2005-01-12'],
      ['2505302', 'Adnan Faisal', 'adnan.faisal@student.edu', '01610000402', '2005-02-18'],
      ['2505303', 'Nabila Haque', 'nabila.haque@student.edu', '01610000403', '2005-03-24'],
      ['2505304', 'Sajid Anwar', 'sajid.anwar@student.edu', '01610000404', '2005-04-30'],
      ['2505305', 'Tasnuva Rahman', 'tasnuva.rahman@student.edu', '01610000405', '2005-05-06'],
      ['2505306', 'Imtiaz Ahmed', 'imtiaz.ahmed@student.edu', '01610000406', '2005-06-11'],
      ['2505307', 'Faria Khatun', 'faria.khatun@student.edu', '01610000407', '2005-07-17'],
      ['2505308', 'Rakibul Hasan', 'rakibul.hasan@student.edu', '01610000408', '2005-08-23'],
      ['2505309', 'Maliha Noor', 'maliha.noor@student.edu', '01610000409', '2005-09-29'],
      ['2505310', 'Shihab Uddin', 'shihab.uddin@student.edu', '01610000410', '2005-10-04'],
      ['2505311', 'Lamia Akter', 'lamia.akter@student.edu', '01610000411', '2005-11-09'],
      ['2505312', 'Naimul Islam', 'naimul.islam@student.edu', '01610000412', '2005-12-15']
    ];

    const programList = Object.values(programs);

    for (let index = 0; index < APPLICANTS.length; index += 1) {
      const [registration, fullName, email, phone, birth] =
        APPLICANTS[index];

      await db.query(`
        INSERT INTO student_registration_requests (
          registration_no, full_name, email, phone,
          date_of_birth, program_id, password_hash, status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
      `, [
        registration, fullName, email, phone, birth,
        programList[index % programList.length], password
      ]);
    }

    const TEACHER_APPLICANTS = [
      ['Md. Rafiqul Alam', 'rafiqul.alam@university.edu', '01510000501', 'Lecturer', 'Computer Science & Engineering'],
      ['Dr. Sanjida Parvin', 'sanjida.parvin@university.edu', '01510000502', 'Assistant Professor', 'Electrical & Electronic Engineering'],
      ['Mr. Habibur Rahman', 'habibur.rahman@university.edu', '01510000503', 'Lecturer', 'Mechanical Engineering'],
      ['Dr. Kamrul Hasan', 'kamrul.hasan@university.edu', '01510000504', 'Associate Professor', 'Civil Engineering'],
      ['Ms. Tahsin Ara', 'tahsin.ara@university.edu', '01510000505', 'Lecturer', 'Business Administration'],
      ['Dr. Nazmul Karim', 'nazmul.karim@university.edu', '01510000506', 'Professor', 'Economics'],
      ['Ms. Rubaiya Islam', 'rubaiya.islam@university.edu', '01510000507', 'Lecturer', 'Mathematics'],
      ['Mr. Asif Mahmud', 'asif.mahmud@university.edu', '01510000508', 'Lecturer', 'Physics'],
      ['Dr. Sumona Das', 'sumona.das@university.edu', '01510000509', 'Associate Professor', 'English'],
      ['Mr. Tanmoy Saha', 'tanmoy.saha@university.edu', '01510000510', 'Lecturer', 'Pharmacy']
    ];

    for (const [
      fullName, email, phone, designation, dept
    ] of TEACHER_APPLICANTS) {
      await db.query(`
        INSERT INTO faculty_registration_requests (
          full_name, email, phone, department_id,
          designation, password_hash, status
        )
        VALUES ($1,$2,$3,$4,$5,$6,'pending')
      `, [
        fullName, email, phone, departments[dept],
        designation, password
      ]);
    }

    let courseRequests = 0;

    for (let index = 0; index < studentIds.length && courseRequests < 12; index += 1) {
      const studentId = studentIds[index];

      const candidates = (await db.query(`
        SELECT c.course_id
        FROM course c
        JOIN student s ON s.program_id = c.program_id
        WHERE s.student_id = $1
          AND c.active
          AND NOT EXISTS (
            SELECT 1 FROM enrollment e
            WHERE e.student_id = s.student_id
              AND e.course_id = c.course_id
          )
        ORDER BY c.term_no DESC
        LIMIT 1
      `, [studentId])).rows;

      if (!candidates.length) continue;

      await db.query(`
        INSERT INTO course_registration_requests (
          student_id, course_id, academic_year, term, status
        )
        VALUES ($1,$2,$3,'Spring','pending')
        ON CONFLICT DO NOTHING
      `, [studentId, candidates[0].course_id, '2025-2026']);

      courseRequests += 1;
    }

    console.log(
      `Seeded ${APPLICANTS.length} student, ${TEACHER_APPLICANTS.length} teacher and ${courseRequests} course requests`
    );

    // ---------------------------------------------------------
    // 13. Administrator activity log
    // ---------------------------------------------------------
    for (let index = 0; index < 12; index += 1) {
      await db.query(`
        INSERT INTO admin_action_log (
          admin_id, target_table, target_id,
          action_type, old_value, new_value
        )
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [
        anAdmin(index),
        index % 3 === 0 ? 'student'
          : index % 3 === 1 ? 'enrollment' : 'course',
        studentIds[index % studentIds.length],
        index % 4 === 0 ? 'CREATE'
          : index % 4 === 1 ? 'AUTHORIZE'
            : index % 4 === 2 ? 'VERIFY' : 'UPDATE',
        null,
        `Sample administrative action #${index + 1}`
      ]);
    }

    console.log('Seeded 12 activity log entries');

    for (const table of GUARDED_TABLES) {
      await db.query(
        `ALTER TABLE ${table} ENABLE TRIGGER USER`
      );
    }

    await db.query('COMMIT');

    console.log('\nSample data rebuilt successfully.');

    if (keptFaculty) {
      console.log(
        `Kept teacher : ${keptFaculty.full_name} (${KEEP_FACULTY_EMAIL}) — same password as before`
      );
    }

    if (keptStudent) {
      console.log(
        `Kept student : ${keptStudent.full_name} (${KEEP_STUDENT_REG}) — same password as before`
      );
    }

    console.log(
      `Admin logins : admin / registrar / finance / academic — password ${DEFAULT_PASSWORD}`
    );

    console.log(
      `New sample teachers and students also use the password ${DEFAULT_PASSWORD}.`
    );
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Reseed failed:', error.message);
    process.exitCode = 1;
  } finally {
    db.release();
    await pool.end();
  }
}

main();
