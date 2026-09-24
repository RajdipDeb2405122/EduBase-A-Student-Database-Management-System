/**
 * Fill every marks component for the demo verification slice
 * (the 10 CSE Level 1 Term 1 demo students, cse.studentNN@...;
 * the brand-new demo student is left alone), so publication and the student
 * result view can be reached without typing 50 rows by hand.
 *
 *   npm run db:demo-marks
 *
 * Marks are deterministic. The last demo student fails every course
 * (total below 40), which exercises a genuine 0.00 CGPA.
 * Rows whose result is already published are left alone.
 */

const pool = require('../config/database');
const { saveRows } = require('../lib/marks');

const DEMO_DOMAIN = '@demo.edubase.edu';

async function fillDemoMarks(db) {
  const r = await db.query(`
    SELECT
      c.course_id,
      c.course_code,
      c.faculty_id,
      e.enrollment_id,
      s.registration_no
    FROM course c
    JOIN department d ON d.department_id=c.department_id
    JOIN enrollment e ON e.course_id=c.course_id
    JOIN student s ON s.student_id=e.student_id
    LEFT JOIN course_result cr ON cr.enrollment_id=e.enrollment_id
    WHERE d.department_code='CSE'
      AND c.level=1
      AND c.term=1
      AND s.email LIKE 'cse.student%' || $1
      AND e.status IN ('enrolled','completed')
      AND cr.enrollment_id IS NULL
    ORDER BY c.course_code,s.registration_no
  `, [DEMO_DOMAIN]);

  const courses = [...new Set(r.rows.map(x => x.course_id))];
  const students = [...new Set(r.rows.map(x => x.registration_no))].sort();
  const failing = students[students.length - 1];

  for (const [j, courseId] of courses.entries()) {
    const rows = r.rows
      .filter(x => x.course_id === courseId)
      .map(x => {
        const i = students.indexOf(x.registration_no);

        return x.registration_no === failing
          ? {
              enrollment_id: x.enrollment_id,
              attendance: 3,
              class_test: 5,
              semester_final: 20
            }
          : {
              enrollment_id: x.enrollment_id,
              attendance: 6 + (i + j) % 5,
              class_test: 10 + (i * 3 + j * 5) % 11,
              semester_final: 30 + (i * 7 + j * 11) % 41
            };
      });

    await saveRows(db, courseId, r.rows.find(x => x.course_id === courseId).faculty_id, rows);
  }

  return { courses: courses.length, rows: r.rowCount, failing };
}

if (require.main === module) {
  (async () => {
    const db = await pool.connect();

    try {
      await db.query('BEGIN');
      const done = await fillDemoMarks(db);
      await db.query('COMMIT');

      console.log(
        done.rows
          ? `Filled marks for ${done.rows} enrollment(s) across ${done.courses} CSE 1-1 course(s). ` +
              `${done.failing} fails every course.`
          : 'No unpublished CSE 1-1 demo enrollments found. Run npm run db:seed-demo first.'
      );
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
      await pool.end();
    }
  })().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { DEMO_DOMAIN, fillDemoMarks };
