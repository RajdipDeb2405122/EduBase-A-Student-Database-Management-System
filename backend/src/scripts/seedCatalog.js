/**
 * Replace the course catalog with scripts/data/courses_info.txt.
 *
 *   npm run db:seed-catalog
 *
 * Run AFTER db:migrate. The file is validated first (4 departments ×
 * 8 terms × 5 courses, every course 3 credits); any mismatch is
 * reported and nothing is written. After loading, the database is
 * checked again the same way.
 *
 * Courses not listed in the file are deleted. A course that already
 * has enrollments cannot be deleted and aborts the run.
 */

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

const {
  EXPECTED_CREDITS,
  parseCatalog,
  validateCatalog,
  sharedCodes
} = require('../lib/catalog');

const {
  LEVELS,
  TERMS,
  COURSES_PER_TERM,
  termLabel
} = require('../lib/academic');

const SOURCE = path.join(__dirname, 'data', 'courses_info.txt');

class CatalogError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.issues = issues;
  }
}

function readCatalog() {
  const parsed = parseCatalog(fs.readFileSync(SOURCE, 'utf8'));
  const issues = validateCatalog(parsed);

  if (issues.length) {
    throw new CatalogError(
      'courses_info.txt does not match the expected structure',
      issues
    );
  }

  return parsed;
}

// Checks what is actually stored, independently of the parser.
async function verifyStored(db, departmentCodes) {
  const issues = [];

  const r = await db.query(`
    SELECT
      d.department_code,
      lv AS level,
      tm AS term,
      count(c.course_id)::int AS courses,
      count(c.course_id) FILTER (
        WHERE c.credit_hours <> $2
      )::int AS wrong_credit
    FROM department d
    CROSS JOIN generate_series(1,$3::int) AS lv
    CROSS JOIN generate_series(1,$4::int) AS tm
    LEFT JOIN course c
      ON c.department_id=d.department_id
     AND c.level=lv
     AND c.term=tm
     AND c.active=TRUE
    WHERE d.department_code = ANY($1)
    GROUP BY d.department_code,lv,tm
    ORDER BY d.department_code,lv,tm
  `, [departmentCodes, EXPECTED_CREDITS, LEVELS, TERMS]);

  for (const row of r.rows) {
    const where = `${row.department_code} ${termLabel(row.level, row.term)}`;

    if (row.courses !== COURSES_PER_TERM) {
      issues.push(
        `${where}: ${row.courses} active course(s) stored, ` +
          `expected ${COURSES_PER_TERM}`
      );
    }

    if (row.wrong_credit) {
      issues.push(
        `${where}: ${row.wrong_credit} course(s) not ${EXPECTED_CREDITS} credits`
      );
    }
  }

  return { issues, cells: r.rows.length };
}

// Loads the catalog inside the caller's transaction.
async function loadCatalog(db) {
  const { courses, departments } = readCatalog();

  const found = await db.query(`
    SELECT department_id,department_code
    FROM department
    WHERE department_code = ANY($1)
  `, [departments]);

  const deptId = Object.fromEntries(
    found.rows.map(d => [d.department_code, d.department_id])
  );

  const missing = departments.filter(code => !deptId[code]);

  if (missing.length) {
    throw new CatalogError(
      'Departments named in courses_info.txt are missing',
      missing.map(code => `No department with department_code='${code}'`)
    );
  }

  // Remove every course that is not in the file.
  const keep = courses.map(c => `${deptId[c.department_code]}|${c.course_code}`);

  const stale = await db.query(`
    SELECT c.course_id,c.course_code,d.department_code
    FROM course c
    JOIN department d ON d.department_id=c.department_id
    WHERE NOT (c.department_id || '|' || c.course_code = ANY($1))
  `, [keep]);

  if (stale.rowCount) {
    const used = await db.query(`
      SELECT DISTINCT c.course_code,d.department_code
      FROM enrollment e
      JOIN course c ON c.course_id=e.course_id
      JOIN department d ON d.department_id=c.department_id
      WHERE e.course_id = ANY($1)
    `, [stale.rows.map(c => c.course_id)]);

    if (used.rowCount) {
      throw new CatalogError(
        'Courses outside courses_info.txt still have enrollments',
        used.rows.map(c => `${c.department_code} ${c.course_code}`)
      );
    }

    await db.query(
      'DELETE FROM course WHERE course_id = ANY($1)',
      [stale.rows.map(c => c.course_id)]
    );
  }

  for (const c of courses) {
    await db.query(`
      INSERT INTO course (
        department_id,course_code,course_title,
        credit_hours,level,term,course_type,active
      )
      VALUES ($1,$2,$3,$4,$5,$6,'Core',TRUE)
      ON CONFLICT (department_id,course_code) DO UPDATE SET
        course_title=EXCLUDED.course_title,
        credit_hours=EXCLUDED.credit_hours,
        level=EXCLUDED.level,
        term=EXCLUDED.term,
        active=TRUE
    `, [
      deptId[c.department_code],
      c.course_code,
      c.course_title,
      c.credit_hours,
      c.level,
      c.term
    ]);
  }

  const verified = await verifyStored(db, departments);

  if (verified.issues.length) {
    throw new CatalogError(
      'The stored catalog does not match the expected structure',
      verified.issues
    );
  }

  const total = await db.query('SELECT count(*)::int AS n FROM course');

  if (total.rows[0].n !== courses.length) {
    throw new CatalogError(
      `The database holds ${total.rows[0].n} courses but the file lists ${courses.length}`
    );
  }

  return {
    courses: courses.length,
    departments,
    removed: stale.rowCount,
    cells: verified.cells,
    shared: sharedCodes(courses)
  };
}

function report(summary) {
  console.log(
    `Catalog loaded: ${summary.courses} courses across ` +
      `${summary.departments.join(', ')} (removed ${summary.removed} old course(s)).`
  );

  console.log(
    `Verified ${summary.cells} department terms: each has exactly ` +
      `${COURSES_PER_TERM} active courses of ${EXPECTED_CREDITS} credits.`
  );

  for (const list of summary.shared) {
    console.log(
      `Note: ${list[0].course_code} is offered by ` +
        list
          .map(c => `${c.department_code} ${termLabel(c.level, c.term)} ("${c.course_title}")`)
          .join(' and ')
    );
  }
}

function fail(error) {
  console.error(`\n✗ ${error.message}`);

  for (const issue of error.issues || []) {
    console.error(`  - ${issue}`);
  }

  process.exitCode = 1;
}

if (require.main === module) {
  (async () => {
    const db = await pool.connect();

    try {
      await db.query('BEGIN');
      const summary = await loadCatalog(db);
      await db.query('COMMIT');
      report(summary);
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
      await pool.end();
    }
  })().catch(fail);
}

module.exports = {
  loadCatalog,
  report,
  fail
};
