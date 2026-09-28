/**
 * Integration tests for the marks / teaching / retake / publish rules.
 *
 *   TEST_DB_NAME=edubase_rules_test npm test
 *
 * DESTRUCTIVE for the test database only: it is dropped and rebuilt
 * (db:init -> db:seed -> db:migrate -> db:seed-demo) before the run.
 * The name must end in "_test" so a real database is never touched.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const path = require('node:path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB = process.env.TEST_DB_NAME || 'edubase_rules_test';

if (!/_test$/.test(DB)) {
  throw new Error(`Refusing to run: test database "${DB}" must end in _test`);
}

process.env.DB_NAME = DB;

const { retakeGrade } = require('../src/lib/grading');

const connection = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
};

let server;
let base;
let pool;
let saveRows;

async function call(method, url, token, body) {
  const res = await fetch(`${base}/api${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  return { status: res.status, body: await res.json().catch(() => null) };
}

async function login(kind, who) {
  const url = {
    admin: '/auth/login',
    faculty: '/faculty-auth/login',
    student: '/student-auth/login'
  }[kind];

  const r = await call('POST', url, null, kind === 'admin'
    ? { username: who, password: 'admin123' }
    : { email: who, password: 'admin123' });

  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}

const one = async (sql, params) => (await pool.query(sql, params)).rows[0];

const course = code => one(`
  SELECT c.* FROM course c JOIN department d USING (department_id)
  WHERE d.department_code='CSE' AND c.course_code=$1
`, [code]);

const student = email => one('SELECT * FROM student WHERE email=$1', [email]);

// Marks written as the course's assigned teacher (like the seed).
async function mark(courseId, enrollmentId, values) {
  const db = await pool.connect();

  try {
    await db.query('BEGIN');
    const c = await db.query('SELECT faculty_id FROM course WHERE course_id=$1', [courseId]);
    await saveRows(db, courseId, c.rows[0].faculty_id, [{ enrollment_id: enrollmentId, ...values }]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

before(async () => {
  const admin = new Pool({ ...connection, database: 'postgres' });
  await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
  await admin.end();

  const env = { ...process.env, DB_NAME: DB };

  for (const script of ['db:init', 'db:seed', 'db:migrate', 'db:seed-demo']) {
    execSync(`npm run --silent ${script}`, {
      cwd: path.join(__dirname, '..'),
      env,
      stdio: 'ignore'
    });
  }

  pool = new Pool({ ...connection, database: DB });
  ({ saveRows } = require('../src/lib/marks'));

  process.env.DEMO_PAYMENTS_ENABLED = 'true';
  const app = require('../src/index');

  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });

  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.closeAllConnections?.();
  server?.close();
  await pool?.end();
  await require('../src/config/database').end();
});

test('retake grading: 56/70 -> 80% -> raw A+ 4.00 -> recorded 3.50', () => {
  const g = retakeGrade(56);

  assert.equal(g.percentage, 80);
  assert.deepEqual(g.raw, { letter: 'A+', point: 4 });
  assert.equal(g.point, 3.5);
  assert.equal(g.letter, 'A-');
  assert.equal(g.passed, true);
});

test('retake grading: a pass whose adjusted GP has no letter keeps the raw letter', () => {
  const g = retakeGrade(28); // 40% -> D 2.00 -> 1.50

  assert.equal(g.passed, true);
  assert.equal(g.point, 1.5);
  assert.equal(g.letter, 'D');
});

test('retake grading: a raw F stays F / 0.00 and is not passed', () => {
  const g = retakeGrade(27.5); // 39.29%

  assert.equal(g.letter, 'F');
  assert.equal(g.point, 0);
  assert.equal(g.passed, false);
});

test('marks outside [0, max] are rejected by the API and never saved', async () => {
  const token = await login('faculty', 'cse.teacher01@demo.edubase.edu');
  const c = await course('CSE 101');

  const sheet = await call('GET', `/faculty-portal/courses/${c.course_id}/marks`, token);
  assert.equal(sheet.status, 200);

  const row = sheet.body.students[0];
  const before = await one('SELECT * FROM course_mark WHERE enrollment_id=$1', [row.enrollment_id]);

  for (const [field, value] of [
    ['attendance', 11], ['class_test', 21], ['semester_final', 71],
    ['attendance', -1], ['semester_final', '70.001']
  ]) {
    const r = await call('PUT', `/faculty-portal/courses/${c.course_id}/marks`, token, {
      marks: [{ enrollment_id: row.enrollment_id, attendance: 5, class_test: 5, semester_final: 5, [field]: value }]
    });

    assert.equal(r.status, 400, `${field}=${value}: ${JSON.stringify(r.body)}`);
  }

  const after = await one('SELECT * FROM course_mark WHERE enrollment_id=$1', [row.enrollment_id]);
  assert.deepEqual(after, before);

  // The database refuses as well, even bypassing the API.
  await assert.rejects(
    pool.query('UPDATE course_mark SET class_test=21 WHERE enrollment_id=$1', [row.enrollment_id]),
    { code: '23514' }
  );
});

test('a second teacher cannot take or be assigned the same course', async () => {
  const c = await course('CSE 101');
  const other = await login('faculty', 'cse.teacher02@demo.edubase.edu');

  const holder = await one('SELECT full_name FROM faculty_public WHERE faculty_id=$1', [c.faculty_id]);

  const r = await call('POST', `/faculty-portal/courses/${c.course_id}`, other);
  assert.equal(r.status, 409);
  assert.equal(r.body.error, `This course is already assigned to ${holder.full_name} for this term.`);

  // The admin gets the same answer.
  const admin = await login('admin', 'admin');
  const teacher02 = await one(`SELECT faculty_id FROM faculty_public WHERE email='cse.teacher02@demo.edubase.edu'`);
  const put = await call('PUT', `/courses/${c.course_id}`, admin, {
    course_code: c.course_code, course_title: c.course_title,
    department_id: c.department_id, credit_hours: c.credit_hours,
    level: c.level, term: c.term, faculty_id: teacher02.faculty_id
  });
  assert.equal(put.status, 409);

  // Final guard: the partial unique index.
  await assert.rejects(
    pool.query('INSERT INTO course_teacher (course_id,faculty_id) VALUES ($1,$2)',
      [c.course_id, teacher02.faculty_id]),
    { code: '23505', constraint: 'course_teacher_one_active' }
  );
});

test('only the assigned teacher can enter or edit marks', async () => {
  const c = await course('CSE 101');
  const other = await login('faculty', 'cse.teacher02@demo.edubase.edu');
  const row = await one('SELECT enrollment_id FROM enrollment WHERE course_id=$1 LIMIT 1', [c.course_id]);

  const read = await call('GET', `/faculty-portal/courses/${c.course_id}/marks`, other);
  assert.equal(read.status, 403);

  const write = await call('PUT', `/faculty-portal/courses/${c.course_id}/marks`, other, {
    marks: [{ enrollment_id: row.enrollment_id, attendance: 1 }]
  });
  assert.equal(write.status, 403);

  const teacher02 = await one(`SELECT faculty_id FROM faculty_public WHERE email='cse.teacher02@demo.edubase.edu'`);
  await assert.rejects(
    pool.query('UPDATE course_mark SET attendance=1, entered_by_faculty_id=$2 WHERE enrollment_id=$1',
      [row.enrollment_id, teacher02.faculty_id]),
    /Only the teacher currently assigned/
  );
});

test('publish: release, advance, lock, retake (pass and F), CGPA, idempotence', async () => {
  const admin = await login('admin', 'admin');
  const cse = await one(`SELECT department_id FROM department WHERE department_code='CSE'`);
  const cse101 = await course('CSE 101');

  const pass = await student('cse.student01@demo.edubase.edu');   // fails, retakes 56/70
  const failTwice = await student('cse.student02@demo.edubase.edu'); // fails, retakes 20/70

  for (const s of [pass, failTwice]) {
    const e = await one('SELECT enrollment_id FROM enrollment WHERE student_id=$1 AND course_id=$2',
      [s.student_id, cse101.course_id]);
    await mark(cse101.course_id, e.enrollment_id, { attendance: 5, class_test: 5, semester_final: 10 });
  }

  const inTerm = (await pool.query(`
    SELECT count(*)::int AS n FROM student s JOIN program p USING (program_id)
    WHERE p.department_id=$1 AND s.current_level=1 AND s.current_term=1
      AND s.email ~ '^cse\\.student'
  `, [cse.department_id])).rows[0].n;

  // --- publish CSE 1-1 -------------------------------------------------
  const published = await call('POST', '/results/publish', admin,
    { department_id: cse.department_id, level: 1, term: 1 });
  assert.equal(published.status, 200, JSON.stringify(published.body));

  const moved = await one(`
    SELECT count(*)::int AS n FROM student
    WHERE email ~ '^cse\\.student' AND current_level=1 AND current_term=2
  `);
  assert.equal(moved.n, inTerm + 10, 'every CSE 1-1 student moved to 1-2 (plus the 10 seeded 1-2)');

  const active = await one(`
    SELECT count(*)::int AS n FROM course_teacher ct JOIN course c USING (course_id)
    WHERE c.department_id=$1 AND c.level=1 AND c.term=1 AND ct.released_at IS NULL
  `, [cse.department_id]);
  assert.equal(active.n, 0, 'CSE 1-1 assignments released');

  const history = await one(`
    SELECT count(*)::int AS n FROM course_teacher
    WHERE course_id=$1 AND release_reason='published'
  `, [cse101.course_id]);
  assert.equal(history.n, 1, 'released assignment kept as history');

  // Marks are read-only now: the old teacher lost the course, and the
  // database refuses any change.
  const t1 = await login('faculty', 'cse.teacher01@demo.edubase.edu');
  const locked = await call('GET', `/faculty-portal/courses/${cse101.course_id}/marks`, t1);
  assert.equal(locked.status, 403);

  await assert.rejects(
    pool.query(`UPDATE course_mark SET attendance=10 WHERE enrollment_id IN
      (SELECT enrollment_id FROM course_result LIMIT 1)`),
    /Marks cannot change after the result is published/
  );

  // Publishing again changes nothing.
  const again = await call('POST', '/results/publish', admin,
    { department_id: cse.department_id, level: 1, term: 1 });
  assert.equal(again.status, 409);

  const stillMoved = await one(`
    SELECT count(*)::int AS n FROM student
    WHERE email ~ '^cse\\.student' AND current_level=1 AND current_term=2
  `);
  assert.equal(stillMoved.n, moved.n, 'nobody advanced twice');

  // --- retake offered in the next term ---------------------------------
  const sPass = await login('student', 'cse.student01@demo.edubase.edu');
  const sFail = await login('student', 'cse.student02@demo.edubase.edu');

  const courses = await call('GET', `/student-auth/courses/${pass.student_id}`, sPass);
  assert.equal(courses.body.level, 1);
  assert.equal(courses.body.term, 2);
  assert.ok(courses.body.retakes.some(r => r.course_code === 'CSE 101'));

  // A passed course is never offered and cannot be forced in the DB.
  const passed = await course('CSE 103');
  await assert.rejects(
    pool.query(`INSERT INTO enrollment (student_id,course_id,registration_id,academic_year,term,is_retake)
      SELECT $1,$2,registration_id,'2025-2026','1-2',TRUE FROM term_registration WHERE student_id=$1 LIMIT 1`,
      [pass.student_id, passed.course_id]),
    /failed course that has not been cleared/
  );

  // Retake needs the term registration first.
  const early = await call('POST', `/student-auth/me/${pass.student_id}/retakes/${cse101.course_id}`, sPass);
  assert.equal(early.status, 409);

  for (const [s, token] of [[pass, sPass], [failTwice, sFail]]) {
    const info = await call('GET', `/student-auth/courses/${s.student_id}`, token);

    const req = await call('POST', '/course-registration/request', token, {
      course_ids: info.body.courses.map(c => c.course_id),
      academic_year: '2025-2026'
    });
    assert.equal(req.status, 201, JSON.stringify(req.body));

    const ok = await call('PUT', `/course-registration/${req.body.registration.registration_id}/approve`, admin);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));

    const retake = await call('POST', `/student-auth/me/${s.student_id}/retakes/${cse101.course_id}`, token);
    assert.equal(retake.status, 201, JSON.stringify(retake.body));

    // Unpaid retake: not on the teacher's roster yet.
    const pending = await one('SELECT status, is_retake FROM enrollment WHERE enrollment_id=$1',
      [retake.body.enrollment.enrollment_id]);
    assert.deepEqual(pending, { status: 'pending_payment', is_retake: true });

    const dup = await call('POST', `/student-auth/me/${s.student_id}/retakes/${cse101.course_id}`, token);
    assert.equal(dup.status, 409);

    const unpaid = await pool.query(`SELECT enrollment_id FROM enrollment
      WHERE student_id=$1 AND status='pending_payment'`, [s.student_id]);

    for (const { enrollment_id } of unpaid.rows) {
      const paid = await call('POST', `/student-payments/enrollments/${enrollment_id}/pay`, token, { confirm: true });
      assert.equal(paid.status, 201, JSON.stringify(paid.body));
    }
  }

  // --- the teacher of CSE 101 now grades the retakes (Final only) -------
  const taken = await call('POST', `/faculty-portal/courses/${cse101.course_id}`, t1);
  assert.equal(taken.status, 200, JSON.stringify(taken.body));

  const sheet = await call('GET', `/faculty-portal/courses/${cse101.course_id}/marks`, t1);
  assert.equal(sheet.status, 200);
  assert.equal(sheet.body.students.length, 2);
  assert.ok(sheet.body.students.every(s => s.is_retake));

  const rowOf = s => sheet.body.students.find(x => x.student_id === s.student_id);

  const withCt = await call('PUT', `/faculty-portal/courses/${cse101.course_id}/marks`, t1, {
    marks: [{ enrollment_id: rowOf(pass).enrollment_id, attendance: 5, semester_final: 56 }]
  });
  assert.equal(withCt.status, 400);
  assert.match(withCt.body.error, /retake student/);

  const over = await call('PUT', `/faculty-portal/courses/${cse101.course_id}/marks`, t1, {
    marks: [{ enrollment_id: rowOf(pass).enrollment_id, semester_final: 71 }]
  });
  assert.equal(over.status, 400);

  const saved = await call('PUT', `/faculty-portal/courses/${cse101.course_id}/marks`, t1, {
    marks: [
      { enrollment_id: rowOf(pass).enrollment_id, semester_final: 56 },
      { enrollment_id: rowOf(failTwice).enrollment_id, semester_final: 20 }
    ]
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  // Regular 1-2 marks for the two students, as the 1-2 teachers.
  for (const s of [pass, failTwice]) {
    const regular = await pool.query(`
      SELECT e.enrollment_id, e.course_id FROM enrollment e
      JOIN course c USING (course_id)
      WHERE e.student_id=$1 AND NOT e.is_retake AND c.level=1 AND c.term=2
    `, [s.student_id]);

    for (const r of regular.rows) {
      await mark(r.course_id, r.enrollment_id, { attendance: 8, class_test: 16, semester_final: 50 });
    }
  }

  // --- publish CSE 1-2 -------------------------------------------------
  const p2 = await call('POST', '/results/publish', admin,
    { department_id: cse.department_id, level: 1, term: 2 });
  assert.equal(p2.status, 200, JSON.stringify(p2.body));

  const retakeResult = await one(`
    SELECT cr.* FROM course_result cr JOIN enrollment e USING (enrollment_id)
    WHERE cr.student_id=$1 AND e.course_id=$2 AND cr.is_retake
  `, [pass.student_id, cse101.course_id]);

  assert.equal(Number(retakeResult.grade_point), 3.5);
  assert.equal(retakeResult.letter_grade, 'A-');
  assert.equal(Number(retakeResult.raw_grade_point), 4);
  assert.equal(Number(retakeResult.total), 80);
  assert.deepEqual([retakeResult.level, retakeResult.term], [1, 2]);

  // CGPA: CSE 101 counted once, with the retake's 3.50 (not the F).
  const expected = await one(`
    SELECT round(sum(gp * ch) / sum(ch), 2) AS cgpa FROM (
      SELECT DISTINCT ON (e.course_id) cr.grade_point gp, cr.credit_hours ch
      FROM course_result cr JOIN enrollment e USING (enrollment_id)
      WHERE cr.student_id=$1
      ORDER BY e.course_id, cr.level DESC, cr.term DESC
    ) x
  `, [pass.student_id]);

  const withF = await one(`
    SELECT round(sum(grade_point * credit_hours) / sum(credit_hours), 2) AS cgpa,
           count(*)::int AS attempts
    FROM course_result WHERE student_id=$1
  `, [pass.student_id]);

  const current = await student('cse.student01@demo.edubase.edu');
  assert.equal(withF.attempts, 11, 'failed attempt kept in the history');
  assert.equal(current.current_cgpa, expected.cgpa);
  assert.notEqual(current.current_cgpa, withF.cgpa);

  const view = await call('GET', `/student-auth/me/${pass.student_id}/results?level=1&term=1`, sPass);
  assert.ok(view.body.courses.find(c => c.course_code === 'CSE 101' && c.letter_grade === 'F').superseded);

  // Cleared: no longer offered.
  const after1 = await call('GET', `/student-auth/courses/${pass.student_id}`, sPass);
  assert.ok(!after1.body.retakes.some(r => r.course_code === 'CSE 101'));
  assert.deepEqual([after1.body.level, after1.body.term], [2, 1]);

  // Raw F on the retake: still failed and offered again.
  const fResult = await one(`
    SELECT cr.* FROM course_result cr JOIN enrollment e USING (enrollment_id)
    WHERE cr.student_id=$1 AND e.course_id=$2 AND cr.is_retake
  `, [failTwice.student_id, cse101.course_id]);
  assert.equal(fResult.letter_grade, 'F');
  assert.equal(Number(fResult.grade_point), 0);

  const after2 = await call('GET', `/student-auth/courses/${failTwice.student_id}`, sFail);
  assert.ok(after2.body.retakes.some(r => r.course_code === 'CSE 101'));

  // The retake course's assignment was released with the publication.
  const cse101Active = await one(`SELECT count(*)::int AS n FROM course_teacher
    WHERE course_id=$1 AND released_at IS NULL`, [cse101.course_id]);
  assert.equal(cse101Active.n, 0);
});
