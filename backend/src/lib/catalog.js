// Parser and structural validator for scripts/data/courses_info.txt.
//
// Format:
//   CSE Curriculum            <- department code
//   Level-1 Term-1            <- level + term
//   1. Title   (CSE 101) - 3.00
//   1. Long title that wraps
//                (CSE 301) - 3.00   <- continuation line
//
// Nothing is corrected silently: anything unexpected is returned in
// `problems` so the seeder can refuse to load the catalog.

const {
  LEVELS,
  TERMS,
  COURSES_PER_TERM,
  termLabel
} = require('./academic');

const EXPECTED_CREDITS = 3;

const DEPARTMENT = /^([A-Z]+) Curriculum\s*$/;
const TERM = /^Level-(\d+) Term-(\d+)\s*$/;
const ITEM = /^\d+\.\s+(.*)$/;
const COURSE = /^(.*?)\s*\(([A-Z]+) (\d+)\)\s*-\s*(\d+(?:\.\d+)?)\s*$/;
const DECORATION = /^[=-]+\s*$/;

function parseCatalog(text) {
  const courses = [];
  const problems = [];
  const departments = [];

  let department = null;
  let place = null;
  let pending = null;

  const flush = () => {
    if (!pending) return;

    const m = COURSE.exec(pending.text);

    if (!m) {
      problems.push(
        `Line ${pending.line}: cannot read a course from "${pending.text}"`
      );
    } else if (!department || !place) {
      problems.push(
        `Line ${pending.line}: course listed outside a department/term heading`
      );
    } else {
      courses.push({
        line: pending.line,
        department_code: department,
        level: place.level,
        term: place.term,
        course_code: `${m[2]} ${m[3]}`,
        course_title: m[1].replace(/\s+/g, ' ').trim(),
        credit_hours: Number(m[4])
      });
    }

    pending = null;
  };

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    const number = index + 1;

    if (!line || DECORATION.test(line)) {
      flush();
      return;
    }

    let m;

    if ((m = DEPARTMENT.exec(line))) {
      flush();
      department = m[1];
      place = null;
      departments.push(department);
      return;
    }

    if ((m = TERM.exec(line))) {
      flush();
      place = { level: Number(m[1]), term: Number(m[2]) };
      return;
    }

    if ((m = ITEM.exec(line))) {
      flush();
      pending = { line: number, text: m[1] };
      return;
    }

    if (pending) {
      pending.text += ' ' + line;
      return;
    }

    problems.push(`Line ${number}: unexpected text "${line}"`);
  });

  flush();

  return { courses, departments, problems };
}

// Checks the parsed file against the fixed academic structure.
function validateCatalog({ courses, departments, problems }) {
  const issues = [...problems];

  for (const code of departments) {
    for (let lv = 1; lv <= LEVELS; lv++) {
      for (let tm = 1; tm <= TERMS; tm++) {
        const count = courses.filter(c =>
          c.department_code === code &&
          c.level === lv &&
          c.term === tm
        ).length;

        if (count !== COURSES_PER_TERM) {
          issues.push(
            `${code} ${termLabel(lv, tm)}: ${count} course(s), ` +
              `expected ${COURSES_PER_TERM}`
          );
        }
      }
    }
  }

  for (const c of courses) {
    if (c.level < 1 || c.level > LEVELS || c.term < 1 || c.term > TERMS) {
      issues.push(
        `Line ${c.line}: ${c.course_code} is placed at invalid ` +
          `level/term ${termLabel(c.level, c.term)}`
      );
    }

    if (c.credit_hours !== EXPECTED_CREDITS) {
      issues.push(
        `Line ${c.line}: ${c.department_code} ${c.course_code} has ` +
          `${c.credit_hours} credits, expected ${EXPECTED_CREDITS}`
      );
    }
  }

  // A code may be shared across departments, but not repeated
  // inside one department.
  const seen = new Map();

  for (const c of courses) {
    const key = `${c.department_code}|${c.course_code}`;

    if (seen.has(key)) {
      issues.push(
        `${c.department_code} lists ${c.course_code} twice ` +
          `(lines ${seen.get(key)} and ${c.line})`
      );
    } else {
      seen.set(key, c.line);
    }
  }

  return issues;
}

// Informational: codes that appear in more than one department.
function sharedCodes(courses) {
  const byCode = new Map();

  for (const c of courses) {
    if (!byCode.has(c.course_code)) byCode.set(c.course_code, []);
    byCode.get(c.course_code).push(c);
  }

  return [...byCode.values()].filter(list => list.length > 1);
}

module.exports = {
  EXPECTED_CREDITS,
  parseCatalog,
  validateCatalog,
  sharedCodes
};
