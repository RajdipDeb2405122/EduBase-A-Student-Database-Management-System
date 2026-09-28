/**
 * Demo data: students, teachers, assignments, enrollments and marks.
 *
 *   npm run db:seed-demo
 *
 * Run AFTER db:migrate. Idempotent: it counts what already exists
 * and only tops up, so running it again creates nothing new. Existing
 * accounts are never renamed, renumbered or given a new password.
 *
 * Targets (demo accounts, @demo.edubase.edu):
 *   students  CSE 1-1, CSE 1-2, EEE 1-1, EEE 1-2, ME 1-1: 10 each
 *             <dept>.studentNN   (numbered per department)
 *   teachers  CSE, EEE, ME: 10 each
 *             <dept>.teacherNN   (numbered per department)
 * Then, for those five department terms:
 *   - the course catalog (scripts/data/courses_info.txt) is loaded
 *   - every course gets exactly one teacher of its department
 *     (an existing active assignment is kept)
 *   - every demo student is registered, paid and enrolled in all
 *     regular courses of their current term
 *   - missing marks are filled as if entered by the assigned teacher
 *     (0.5 steps, within the limits, nobody fails: totals >= 50)
 * Results are NOT published. The brand-new student cse.new@... is
 * kept unregistered on purpose.
 *
 * All new demo passwords: admin123. The account list is printed and
 * written to backend/seed_credentials.txt.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const { createAccount } = require('../lib/accounts');
const { authorize, approve } = require('../lib/termRegistration');
const { FEE_AMOUNT } = require('../lib/courseFees');
const { MARK_COMPONENTS, gradeFor } = require('../lib/grading');
const { saveRows } = require('../lib/marks');
const teaching = require('../lib/teaching');
const { termLabel } = require('../lib/academic');
const { loadCatalog, report, fail } = require('./seedCatalog');
const { DEMO_DOMAIN } = require('./fillDemoMarks');

const PASSWORD = 'admin123';
const ACADEMIC_YEAR = '2025-2026';
const STUDENTS_PER_GROUP = 10;
const TEACHERS_PER_DEPARTMENT = 10;
const MIN_TOTAL = 50;

const CREDENTIALS_FILE = path.join(__dirname, '../../seed_credentials.txt');

// Registration numbers: 26 + department number + student number.
const DEPARTMENTS = [
  { code: 'CSE', name: 'Computer Science & Engineering', program: 'B.Sc. in Computer Science', regPrefix: '2601' },
  { code: 'EEE', name: 'Electrical & Electronic Engineering', program: 'B.Sc. in Electrical Engineering', regPrefix: '2602' },
  { code: 'ME', name: 'Mechanical Engineering', program: 'B.Sc. in Mechanical Engineering', regPrefix: '2603' }
];

const GROUPS = [
  { code: 'CSE', level: 1, term: 1 },
  { code: 'CSE', level: 1, term: 2 },
  { code: 'EEE', level: 1, term: 1 },
  { code: 'EEE', level: 1, term: 2 },
  { code: 'ME', level: 1, term: 1 }
];

const DESIGNATIONS = [
  'Professor',
  'Associate Professor',
  'Assistant Professor',
  'Lecturer'
];

// Name parts that go together (gendered surnames only with matching
// first names; Hindu first names with Hindu surnames).
const NAME_POOLS = [
  {
    first: [
      'Ahnaf', 'Ashraful', 'Badrul', 'Emon', 'Habib', 'Jubayer', 'Kamrul',
      'Mehedi', 'Nafis', 'Obaidul', 'Rafsan', 'Sajid', 'Shahriar', 'Tahsin',
      'Wasif', 'Mahir', 'Rashed', 'Zahid', 'Saif', 'Irfan', 'Nayeem',
      'Rezaul', 'Towhid', 'Fahad', 'Minhaz', 'Asif'
    ],
    last: [
      'Ahmed', 'Alam', 'Bhuiyan', 'Chowdhury', 'Haque', 'Hossain', 'Islam',
      'Kabir', 'Khan', 'Mahmud', 'Rahman', 'Reza', 'Siddique', 'Talukder',
      'Uddin', 'Zaman', 'Mia', 'Molla', 'Sarwar'
    ]
  },
  {
    first: [
      'Anika', 'Afsana', 'Bushra', 'Farzana', 'Humaira', 'Ishrat', 'Lamia',
      'Mithila', 'Nowshin', 'Rumana', 'Samira', 'Sharmin', 'Tanjila',
      'Zarin', 'Fariha', 'Nazia', 'Sumaiya', 'Rubaiya', 'Tamanna', 'Maisha',
      'Jarin', 'Raisa', 'Tasfia', 'Nabila'
    ],
    last: [
      'Ahmed', 'Alam', 'Chowdhury', 'Haque', 'Hossain', 'Islam', 'Kabir',
      'Khan', 'Rahman', 'Siddique', 'Zaman', 'Akter', 'Begum', 'Nahar',
      'Sultana', 'Khatun', 'Jahan'
    ]
  },
  {
    first: [
      'Arnob', 'Sourav', 'Joy', 'Pritom', 'Anik', 'Priyanka', 'Orpita',
      'Tanushree', 'Moumita', 'Ananya'
    ],
    last: ['Das', 'Saha', 'Sarkar', 'Roy', 'Dey', 'Paul', 'Chakraborty', 'Biswas']
  }
];

// Deterministic pseudo-random numbers, so a re-run makes the same
// choices (mulberry32).
function random(seed) {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const two = n => String(n).padStart(2, '0');
const demoEmail = (code, kind, n) =>
  `${code.toLowerCase()}.${kind}${two(n)}${DEMO_DOMAIN}`;

// Unique realistic names, never one already used by any account.
async function namePicker(db) {
  const taken = new Set(
    (await db.query('SELECT lower(full_name) AS n FROM users')).rows.map(r => r.n)
  );

  const next = random(20260928);
  const one = list => list[Math.floor(next() * list.length)];

  return () => {
    for (let i = 0; i < 10000; i++) {
      // Mostly Muslim names, about one in eight Hindu.
      const r = next();
      const pool = NAME_POOLS[r < 0.44 ? 0 : r < 0.88 ? 1 : 2];
      const name = `${one(pool.first)} ${one(pool.last)}`;

      if (!taken.has(name.toLowerCase())) {
        taken.add(name.toLowerCase());
        return name;
      }
    }

    throw new Error('Ran out of unique demo names');
  };
}

// CSE / EEE / ME and a Bachelor program for each (created if missing).
async function ensureDepartment(db, d) {
  let dep = await db.query(
    'SELECT department_id FROM department WHERE department_code=$1',
    [d.code]
  );

  if (!dep.rowCount) {
    dep = await db.query(`
      INSERT INTO department (department_name,department_code)
      VALUES ($1,$2)
      RETURNING department_id
    `, [d.name, d.code]);

    console.log(`Created department ${d.code}`);
  }

  const departmentId = dep.rows[0].department_id;

  let program = await db.query(`
    SELECT program_id
    FROM program
    WHERE department_id=$1
    ORDER BY (degree_level='Bachelor') DESC, program_id
    LIMIT 1
  `, [departmentId]);

  if (!program.rowCount) {
    program = await db.query(`
      INSERT INTO program (
        department_id,program_name,degree_level,duration_years,total_credits
      )
      VALUES ($1,$2,'Bachelor',4,160)
      RETURNING program_id
    `, [departmentId, d.program]);

    console.log(`Created program ${d.program}`);
  }

  return {
    ...d,
    department_id: departmentId,
    program_id: program.rows[0].program_id
  };
}

// Highest NN used in <dept>.<kind>NN@demo... (0 when none).
async function highestNumber(db, code, kind) {
  const r = await db.query(`
    SELECT COALESCE(max(substring(email FROM $1)::int), 0) AS n
    FROM users
    WHERE email ~ $1
  `, [`^${code.toLowerCase()}\\.${kind}(\\d{2,})@demo\\.edubase\\.edu$`]);

  return r.rows[0].n;
}

async function topUpTeachers(db, dept, adminId, hash, pickName) {
  const existing = await db.query(`
    SELECT count(*)::int AS n
    FROM faculty_public
    WHERE department_id=$1 AND email ~ $2
  `, [dept.department_id, `^${dept.code.toLowerCase()}\\.teacher\\d{2,}@demo\\.edubase\\.edu$`]);

  let number = await highestNumber(db, dept.code, 'teacher');
  const created = [];

  for (let n = existing.rows[0].n; n < TEACHERS_PER_DEPARTMENT; n++) {
    number++;

    const f = await createAccount(db, 'faculty', {
      full_name: pickName(),
      email: demoEmail(dept.code, 'teacher', number),
      department_id: dept.department_id,
      designation: DESIGNATIONS[number % DESIGNATIONS.length]
    }, adminId, hash);

    created.push(f.faculty_id);
  }

  return created;
}

async function freeRegistrationNo(db, prefix, number) {
  for (let n = number; ; n++) {
    const regNo = `${prefix}${String(n).padStart(3, '0')}`;

    const used = await db.query(`
      SELECT 1 FROM student WHERE registration_no=$1
      UNION ALL
      SELECT 1 FROM users WHERE username=$1
    `, [regNo]);

    if (!used.rowCount) return regNo;
  }
}

async function topUpStudents(db, dept, group, adminId, hash, pickName) {
  const existing = await db.query(`
    SELECT count(*)::int AS n
    FROM student s
    WHERE s.program_id IN (SELECT program_id FROM program WHERE department_id=$1)
      AND s.current_level=$2
      AND s.current_term=$3
      AND s.email ~ $4
  `, [
    dept.department_id,
    group.level,
    group.term,
    `^${dept.code.toLowerCase()}\\.student\\d{2,}@demo\\.edubase\\.edu$`
  ]);

  let number = await highestNumber(db, dept.code, 'student');
  const created = [];

  for (let n = existing.rows[0].n; n < STUDENTS_PER_GROUP; n++) {
    number++;

    const s = await createAccount(db, 'student', {
      full_name: pickName(),
      email: demoEmail(dept.code, 'student', number),
      registration_no: await freeRegistrationNo(db, dept.regPrefix, number),
      program_id: dept.program_id,
      admission_date: group.level === 1 && group.term === 1
        ? '2025-07-01'
        : '2025-01-01',
      current_level: group.level,
      current_term: group.term
    }, adminId, hash);

    created.push(s.student_id);
  }

  return created;
}

// Same effect as the student's demo payment: receipt + activation.
async function payPending(db, registrationId) {
  const e = await db.query(`
    SELECT enrollment_id
    FROM enrollment
    WHERE registration_id=$1
      AND status='pending_payment'
      AND NOT is_retake
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

  return e.rowCount;
}

// Registers, approves and pays every demo student of the group for
// their current term. Already-complete students are left alone.
async function enrollGroup(db, dept, group, adminId) {
  const students = await db.query(`
    SELECT s.student_id, r.registration_id, r.status
    FROM student s
    LEFT JOIN term_registration r
      ON r.student_id=s.student_id
     AND r.level=s.current_level
     AND r.term=s.current_term
     AND r.status IN ('pending','approved')
    WHERE s.program_id IN (SELECT program_id FROM program WHERE department_id=$1)
      AND s.current_level=$2
      AND s.current_term=$3
      AND s.current_status='active'
      AND s.email ~ $4
    ORDER BY s.registration_no
  `, [
    dept.department_id,
    group.level,
    group.term,
    `^${dept.code.toLowerCase()}\\.student\\d{2,}@demo\\.edubase\\.edu$`
  ]);

  let paid = 0;

  for (const s of students.rows) {
    let registrationId = s.registration_id;

    if (!registrationId) {
      const { registration } = await authorize(db, {
        student_id: s.student_id,
        academic_year: ACADEMIC_YEAR
      }, adminId);

      registrationId = registration.registration_id;
    } else if (s.status === 'pending') {
      await approve(db, registrationId, adminId);
    }

    paid += await payPending(db, registrationId);
  }

  return paid;
}

// One teacher of the course's own department per course, spread over
// the department's demo teachers (least loaded first).
async function assignTeachers(db, dept, group) {
  const courses = await db.query(`
    SELECT course_id, course_code
    FROM course
    WHERE department_id=$1 AND level=$2 AND term=$3 AND active
    ORDER BY course_code
  `, [dept.department_id, group.level, group.term]);

  const assigned = [];

  for (const c of courses.rows) {
    if (await teaching.activeTeacher(db, c.course_id)) continue;

    const t = await db.query(`
      SELECT f.faculty_id
      FROM faculty_public f
      WHERE f.department_id=$1
        AND f.status='active'
        AND f.email ~ $2
      ORDER BY (
        SELECT count(*)
        FROM course_teacher ct
        WHERE ct.faculty_id=f.faculty_id AND ct.released_at IS NULL
      ), f.email
      LIMIT 1
    `, [dept.department_id, `^${dept.code.toLowerCase()}\\.teacher\\d{2,}@demo\\.edubase\\.edu$`]);

    if (!t.rowCount) throw new Error(`No ${dept.code} teacher to assign`);

    await teaching.assign(db, c.course_id, t.rows[0].faculty_id);
    assigned.push(c.course_code);
  }

  return assigned;
}

// Marks in 0.5 steps aiming at a realistic grade spread; every total
// is at least MIN_TOTAL (pass mark is 40), so nobody fails.
function demoMarks(existing, seed) {
  const next = random(seed);
  const half = (lo, hi) => Math.round((lo + next() * (hi - lo)) * 2) / 2;

  // Target totals: mostly B..A+, some C+/B-.
  const bands = [[80, 95], [75, 79.5], [70, 74.5], [65, 69.5], [60, 64.5], [55, 59.5], [50, 54.5]];
  const weights = [0.2, 0.18, 0.18, 0.15, 0.13, 0.09, 0.07];

  let pick = next();
  let band = bands[bands.length - 1];

  for (const [i, w] of weights.entries()) {
    if (pick < w) { band = bands[i]; break; }
    pick -= w;
  }

  const target = half(band[0], band[1]);

  const attendance = existing.attendance ?? half(7, 10);
  const classTest = existing.class_test ?? half(Math.max(8, target * 0.2 - 4), 20);

  const final = existing.semester_final ?? Math.min(
    70,
    Math.max(
      0,
      Math.ceil((Math.max(target, MIN_TOTAL) - attendance - classTest) * 2) / 2
    )
  );

  return { attendance, class_test: classTest, semester_final: final };
}

async function fillMarks(db, dept, group) {
  const rows = await db.query(`
    SELECT
      c.course_id,
      c.faculty_id,
      e.enrollment_id,
      s.registration_no,
      m.attendance,
      m.class_test,
      m.semester_final
    FROM course c
    JOIN enrollment e ON e.course_id=c.course_id
    JOIN student s ON s.student_id=e.student_id
    LEFT JOIN course_mark m ON m.enrollment_id=e.enrollment_id
    LEFT JOIN course_result cr ON cr.enrollment_id=e.enrollment_id
    WHERE c.department_id=$1 AND c.level=$2 AND c.term=$3
      AND e.status='enrolled'
      AND NOT e.is_retake
      AND cr.enrollment_id IS NULL
      AND m.total IS NULL
    ORDER BY c.course_id, s.registration_no
  `, [dept.department_id, group.level, group.term]);

  const byCourse = new Map();

  for (const r of rows.rows) {
    if (!byCourse.has(r.course_id)) byCourse.set(r.course_id, []);

    const existing = Object.fromEntries(
      MARK_COMPONENTS.map(c => [c.key, r[c.key] === null ? null : Number(r[c.key])])
    );

    const marks = demoMarks(existing, r.enrollment_id * 7919);
    const total = marks.attendance + marks.class_test + marks.semester_final;

    if (gradeFor(total).letter === 'F' || total < MIN_TOTAL) {
      console.warn(`  Note: ${r.registration_no} keeps existing marks totalling ${total}`);
    }

    byCourse.get(r.course_id).push({
      enrollment_id: r.enrollment_id,
      ...marks,
      faculty_id: r.faculty_id
    });
  }

  for (const [courseId, list] of byCourse) {
    // Entered as the course's assigned teacher.
    await saveRows(db, courseId, list[0].faculty_id, list.map(({ faculty_id, ...m }) => m));
  }

  return rows.rowCount;
}

// Every demo account of the three departments, for the handout.
async function credentials(db, newUserIds) {
  const r = await db.query(`
    SELECT
      u.user_id, u.role, u.full_name, u.email,
      d.department_code,
      s.registration_no,
      s.current_level, s.current_term,
      f.designation
    FROM users u
    LEFT JOIN student s ON s.user_id=u.user_id
    LEFT JOIN program p ON p.program_id=s.program_id
    LEFT JOIN faculty f ON f.user_id=u.user_id
    JOIN department d ON d.department_id=COALESCE(p.department_id, f.department_id)
    WHERE u.email LIKE '%' || $1
      AND d.department_code = ANY($2)
    ORDER BY u.role, d.department_code, s.current_level, s.current_term, u.email
  `, [DEMO_DOMAIN, DEPARTMENTS.map(d => d.code)]);

  return r.rows.map(a => ({
    ...a,
    is_new: newUserIds.has(a.user_id)
  }));
}

function formatCredentials(accounts) {
  const lines = [
    'EduBase demo accounts',
    `Password for every account below: ${PASSWORD}`,
    'Teachers log in at /faculty-login, students at /student-login.',
    '(* = created by the latest seed run)',
    ''
  ];

  const section = (title, list, row) => {
    lines.push(title);
    lines.push('-'.repeat(title.length));
    for (const a of list) lines.push(row(a));
    lines.push('');
  };

  section(
    'TEACHERS',
    accounts.filter(a => a.role === 'faculty'),
    a => `${a.is_new ? '*' : ' '} faculty  ${a.department_code.padEnd(4)} ${'-'.padEnd(4)} ` +
      `${a.full_name.padEnd(22)} ${a.email}`
  );

  section(
    'STUDENTS',
    accounts.filter(a => a.role === 'student'),
    a => `${a.is_new ? '*' : ' '} student  ${a.department_code.padEnd(4)} ` +
      `${termLabel(a.current_level, a.current_term).padEnd(4)} ` +
      `${a.full_name.padEnd(22)} ${a.email.padEnd(34)} reg ${a.registration_no}`
  );

  return lines.join('\n');
}

async function seedDemo(db) {
  const catalog = await loadCatalog(db);

  const admin = await db.query(
    'SELECT admin_id FROM admin ORDER BY admin_id LIMIT 1'
  );

  if (!admin.rowCount) throw new Error('Create an admin account first (db:seed)');

  const adminId = admin.rows[0].admin_id;
  const hash = await bcrypt.hash(PASSWORD, 12);
  const pickName = await namePicker(db);

  const before = new Set(
    (await db.query('SELECT user_id FROM users')).rows.map(r => r.user_id)
  );

  const departments = {};

  for (const d of DEPARTMENTS) {
    departments[d.code] = await ensureDepartment(db, d);
  }

  const summary = { teachers: 0, students: 0, assigned: [], paid: 0, marked: 0 };

  for (const d of Object.values(departments)) {
    summary.teachers += (await topUpTeachers(db, d, adminId, hash, pickName)).length;
  }

  for (const g of GROUPS) {
    const d = departments[g.code];
    summary.students += (await topUpStudents(db, d, g, adminId, hash, pickName)).length;
  }

  // The cse.new demo student stays brand-new (never registered).
  const fresh = await db.query('SELECT 1 FROM users WHERE email=$1', [`cse.new${DEMO_DOMAIN}`]);

  if (!fresh.rowCount) {
    await createAccount(db, 'student', {
      full_name: pickName(),
      email: `cse.new${DEMO_DOMAIN}`,
      registration_no: await freeRegistrationNo(db, '2601', 99),
      program_id: departments.CSE.program_id,
      admission_date: '2025-07-01',
      current_level: 1,
      current_term: 1
    }, adminId, hash);
  }

  for (const g of GROUPS) {
    const d = departments[g.code];
    const label = `${g.code} ${termLabel(g.level, g.term)}`;

    for (const code of await assignTeachers(db, d, g)) {
      summary.assigned.push(`${label} ${code}`);
    }

    summary.paid += await enrollGroup(db, d, g, adminId);
    summary.marked += await fillMarks(db, d, g);
  }

  const after = (await db.query('SELECT user_id FROM users')).rows
    .map(r => r.user_id)
    .filter(idValue => !before.has(idValue));

  return {
    catalog,
    summary,
    accounts: await credentials(db, new Set(after))
  };
}

if (require.main === module) {
  (async () => {
    const db = await pool.connect();
    let done;

    try {
      await db.query('BEGIN');
      done = await seedDemo(db);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
      await pool.end();
    }

    report(done.catalog);

    const s = done.summary;

    console.log(
      `\nCreated ${s.teachers} teacher(s) and ${s.students} student(s); ` +
        `assigned ${s.assigned.length} course(s); ` +
        `paid ${s.paid} enrollment(s); filled marks for ${s.marked} enrollment(s). ` +
        'No results were published.'
    );

    const text = formatCredentials(done.accounts);

    fs.writeFileSync(CREDENTIALS_FILE, `${text}\n`);

    console.log(`\n${text}`);
    console.log(`\nWritten to ${path.relative(process.cwd(), CREDENTIALS_FILE)}`);
  })().catch(fail);
}

module.exports = { seedDemo };
