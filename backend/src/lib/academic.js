const { check, id } = require('./common');

// Fixed academic structure: 4 levels × 2 terms, 5 courses each.
const LEVELS = 4;
const TERMS = 2;
const COURSES_PER_TERM = 5;

function level(value, label = 'level') {
  const n = id(value, label);
  check(n <= LEVELS, `Level must be between 1 and ${LEVELS}`);
  return n;
}

function term(value, label = 'term') {
  const n = id(value, label);
  check(n <= TERMS, `Term must be between 1 and ${TERMS}`);
  return n;
}

const termLabel = (lv, tm) => `${lv}-${tm}`;

// The student's department (through their program) and current
// level + term. `lock` takes a row lock for registration writes.
async function standing(db, studentId, lock = false) {
  const r = await db.query(`
    SELECT
      s.student_id,
      s.registration_no,
      s.full_name,
      s.current_level,
      s.current_term,
      s.current_status,
      s.current_cgpa,
      d.department_id,
      d.department_code,
      d.department_name
    FROM student s
    JOIN program p ON p.program_id=s.program_id
    JOIN department d ON d.department_id=p.department_id
    WHERE s.student_id=$1
    ${lock ? 'FOR UPDATE OF s' : ''}
  `, [studentId]);

  check(r.rowCount, 'Student not found', 404);
  return r.rows[0];
}

// Active catalog courses of one department term.
async function termCourses(db, departmentId, lv, tm) {
  const r = await db.query(`
    SELECT c.*, f.full_name AS faculty_name
    FROM course c
    LEFT JOIN faculty_public f ON f.faculty_id=c.faculty_id
    WHERE c.department_id=$1
      AND c.level=$2
      AND c.term=$3
      AND c.active=TRUE
    ORDER BY c.course_code
  `, [departmentId, lv, tm]);

  return r.rows;
}

// Registration and results need the complete set of term courses.
function requireFullTerm(courses, lv, tm) {
  check(
    courses.length === COURSES_PER_TERM,
    `Term ${termLabel(lv, tm)} has ${courses.length} active course(s) ` +
      `in the catalog; exactly ${COURSES_PER_TERM} are required`,
    409
  );
}

module.exports = {
  LEVELS,
  TERMS,
  COURSES_PER_TERM,
  level,
  term,
  termLabel,
  standing,
  termCourses,
  requireFullTerm
};
