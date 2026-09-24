/**
 * End-to-end demo data for registration → marks → publish → result.
 *
 *   npm run db:seed-demo                  # marks left empty
 *   npm run db:seed-demo -- --with-marks  # marks filled as well
 *   npm run db:demo-marks                 # fill marks later
 *
 * Run AFTER db:migrate. Safe to re-run: every demo account uses the
 * @demo.edubase.edu email domain and is removed and rebuilt, along
 * with its enrollments, payments, marks and results. Other accounts
 * are not touched.
 *
 * Creates:
 *   - the full course catalog (scripts/data/courses_info.txt)
 *   - CSE 1-1: 10 students registered, paid and enrolled in all 5
 *     courses; 5 teachers, one per course
 *   - EEE 1-1: 5 students registered, paid and enrolled in all 5
 *   - 1 brand-new CSE 1-1 student with no registration (no CGPA yet)
 * All demo passwords: admin123
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const { createAccount } = require('../lib/accounts');
const { authorize } = require('../lib/termRegistration');
const { FEE_AMOUNT } = require('../lib/courseFees');
const { loadCatalog, report, fail } = require('./seedCatalog');
const { DEMO_DOMAIN, fillDemoMarks } = require('./fillDemoMarks');

const PASSWORD = 'admin123';
const ACADEMIC_YEAR = '2025-2026';

const CSE_TEACHERS = [
  'Farhana Rahman',
  'Tanvir Ahmed',
  'Nusrat Jahan',
  'Mahmudul Hasan',
  'Sabrina Chowdhury'
];

const CSE_STUDENTS = [
  'Arif Hossain',
  'Sadia Islam',
  'Rakib Hasan',
  'Tasnim Akter',
  'Imran Kabir',
  'Nabila Sultana',
  'Shafin Ahmed',
  'Maliha Karim',
  'Fahim Rahman',
  'Jannatul Ferdous'
];

const EEE_STUDENTS = [
  'Sakib Mahmud',
  'Ayesha Siddiqua',
  'Rifat Chowdhury',
  'Mim Akter',
  'Tahmid Hasan'
];

const email = (prefix, n) =>
  `${prefix}${String(n).padStart(2, '0')}${DEMO_DOMAIN}`;

async function removeDemoData(db) {
  const students = (await db.query(`
    SELECT s.student_id
    FROM student s
    JOIN users u ON u.user_id=s.user_id
    WHERE u.email LIKE '%' || $1
  `, [DEMO_DOMAIN])).rows.map(r => r.student_id);

  if (students.length) {
    await db.query(
      'DELETE FROM term_result WHERE student_id = ANY($1)',
      [students]
    );

    await db.query(`
      DELETE FROM course_mark
      WHERE enrollment_id IN (
        SELECT enrollment_id FROM enrollment WHERE student_id = ANY($1)
      )
    `, [students]);

    // Demo receipts only; the guard keeps real receipts immutable.
    await db.query('ALTER TABLE course_payment DISABLE TRIGGER guard_course_payment');

    await db.query(`
      DELETE FROM course_payment
      WHERE enrollment_id IN (
        SELECT enrollment_id FROM enrollment WHERE student_id = ANY($1)
      )
    `, [students]);

    await db.query('ALTER TABLE course_payment ENABLE TRIGGER guard_course_payment');

    await db.query('DELETE FROM enrollment WHERE student_id = ANY($1)', [students]);
    await db.query('DELETE FROM term_registration WHERE student_id = ANY($1)', [students]);
  }

  // Publications left without any published student.
  await db.query(`
    DELETE FROM result_publication p
    WHERE NOT EXISTS (
      SELECT 1 FROM term_result tr
      WHERE tr.department_id=p.department_id
        AND tr.level=p.level
        AND tr.term=p.term
    )
  `);

  // Marks entered by demo teachers on real students keep their values.
  const removed = await db.query(`
    DELETE FROM users
    WHERE email LIKE '%' || $1
    RETURNING user_id
  `, [DEMO_DOMAIN]);

  return removed.rowCount;
}

async function department(db, code) {
  const r = await db.query(`
    SELECT
      d.department_id,
      (
        SELECT p.program_id
        FROM program p
        WHERE p.department_id=d.department_id
        ORDER BY (p.degree_level='Bachelor') DESC, p.program_id
        LIMIT 1
      ) AS program_id
    FROM department d
    WHERE d.department_code=$1
  `, [code]);

  if (!r.rowCount || !r.rows[0].program_id) {
    throw new Error(`Department ${code} or its program is missing`);
  }

  return r.rows[0];
}

// Same effect as the student's demo payment: receipt + enrollment
// activation in one transaction.
async function payAll(db, registrationId) {
  const e = await db.query(`
    SELECT enrollment_id
    FROM enrollment
    WHERE registration_id=$1
  `, [registrationId]);

  for (const { enrollment_id } of e.rows) {
    await db.query(`
      INSERT INTO course_payment (
        enrollment_id,amount,currency,payment_mode,receipt_no
      )
      VALUES ($1,$2,'BDT','demo',$3)
    `, [enrollment_id, FEE_AMOUNT, `DEMO-${crypto.randomUUID()}`]);

    await db.query(
      "UPDATE enrollment SET status='enrolled' WHERE enrollment_id=$1",
      [enrollment_id]
    );
  }
}

async function createStudents(db, names, { code, prefix, firstRegNo }, dept, adminId, hash) {
  const created = [];

  for (const [i, name] of names.entries()) {
    const s = await createAccount(db, 'student', {
      full_name: name,
      email: email(prefix, i + 1),
      registration_no: String(firstRegNo + i),
      program_id: dept.program_id,
      admission_date: '2025-07-01',
      current_level: 1,
      current_term: 1
    }, adminId, hash);

    const { registration } = await authorize(db, {
      student_id: s.student_id,
      academic_year: ACADEMIC_YEAR
    }, adminId);

    await payAll(db, registration.registration_id);
    created.push({ ...s, code });
  }

  return created;
}

async function seedDemo(db, withMarks) {
  const catalog = await loadCatalog(db);
  const removed = await removeDemoData(db);

  const admin = await db.query(
    'SELECT admin_id FROM admin ORDER BY admin_id LIMIT 1'
  );

  if (!admin.rowCount) throw new Error('Create an admin account first (db:seed)');

  const adminId = admin.rows[0].admin_id;
  const hash = await bcrypt.hash(PASSWORD, 12);

  const cse = await department(db, 'CSE');
  const eee = await department(db, 'EEE');

  // One teacher per CSE 1-1 course.
  const courses = (await db.query(`
    SELECT course_id,course_code
    FROM course
    WHERE department_id=$1 AND level=1 AND term=1 AND active
    ORDER BY course_code
  `, [cse.department_id])).rows;

  const teachers = [];

  for (const [i, name] of CSE_TEACHERS.entries()) {
    const f = await createAccount(db, 'faculty', {
      full_name: name,
      email: email('cse.teacher', i + 1),
      department_id: cse.department_id,
      designation: 'Lecturer'
    }, adminId, hash);

    // The demo teacher becomes the course's lead instructor.
    await db.query(`
      INSERT INTO course_teacher (course_id,faculty_id)
      VALUES ($1,$2)
    `, [courses[i].course_id, f.faculty_id]);

    await db.query(
      'UPDATE course SET faculty_id=$1 WHERE course_id=$2',
      [f.faculty_id, courses[i].course_id]
    );

    teachers.push({ ...f, course_code: courses[i].course_code });
  }

  const cseStudents = await createStudents(
    db, CSE_STUDENTS,
    { code: 'CSE', prefix: 'cse.student', firstRegNo: 2601001 },
    cse, adminId, hash
  );

  const eeeStudents = await createStudents(
    db, EEE_STUDENTS,
    { code: 'EEE', prefix: 'eee.student', firstRegNo: 2602001 },
    eee, adminId, hash
  );

  const fresh = await createAccount(db, 'student', {
    full_name: 'Nadia Parvin',
    email: `cse.new${DEMO_DOMAIN}`,
    registration_no: '2601099',
    program_id: cse.program_id,
    admission_date: '2025-07-01',
    current_level: 1,
    current_term: 1
  }, adminId, hash);

  const marks = withMarks ? await fillDemoMarks(db) : null;

  return { catalog, removed, teachers, cseStudents, eeeStudents, fresh, marks };
}

if (require.main === module) {
  const withMarks = process.argv.includes('--with-marks');

  (async () => {
    const db = await pool.connect();
    let done;

    try {
      await db.query('BEGIN');
      done = await seedDemo(db, withMarks);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
      await pool.end();
    }

    report(done.catalog);

    if (done.removed) {
      console.log(`Removed ${done.removed} previous demo account(s).`);
    }

    console.log(`\nDemo accounts (password: ${PASSWORD})`);
    console.log('\nCSE 1-1 teachers (faculty login):');
    for (const t of done.teachers) {
      console.log(`  ${t.email.padEnd(36)} ${t.course_code}`);
    }

    console.log('\nCSE 1-1 students (student login, registration no.):');
    for (const s of done.cseStudents) {
      console.log(`  ${s.registration_no}  ${s.email}`);
    }

    console.log('\nEEE 1-1 students:');
    for (const s of done.eeeStudents) {
      console.log(`  ${s.registration_no}  ${s.email}`);
    }

    console.log(
      `\nBrand-new student (no registration, no CGPA): ` +
        `${done.fresh.registration_no}  ${done.fresh.email}`
    );

    console.log(
      done.marks
        ? `\nMarks filled for ${done.marks.rows} CSE 1-1 enrollments ` +
            `(${done.marks.failing} fails every course).`
        : '\nMarks are empty. Fill them all with: npm run db:demo-marks'
    );
  })().catch(fail);
}
