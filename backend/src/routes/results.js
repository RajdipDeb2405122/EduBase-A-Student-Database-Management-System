const router = require('express').Router();
const pool = require('../config/database');

const {
  wrap,
  check,
  id,
  transaction,
  log
} = require('../lib/common');

const academic = require('../lib/academic');
const { evaluate, publish } = require('../lib/results');
const { GRADE_SCALE, MARK_COMPONENTS } = require('../lib/grading');

async function scope(db, source) {
  const departmentId = id(source.department_id, 'department');

  const d = await db.query(
    'SELECT department_id,department_code,department_name FROM department WHERE department_id=$1',
    [departmentId]
  );

  check(d.rowCount, 'Department not found', 404);

  return {
    department: d.rows[0],
    level: academic.level(source.level),
    term: academic.term(source.term)
  };
}

router.get('/scale', (req, res) => {
  res.json({ grades: GRADE_SCALE, components: MARK_COMPONENTS });
});

router.get('/publications', wrap(async (req, res) => {
  const result = await pool.query(`
    SELECT
      p.*,
      d.department_code,
      d.department_name,
      a.full_name AS published_by_name,
      (
        SELECT count(*)::int
        FROM term_result tr
        WHERE tr.department_id=p.department_id
          AND tr.level=p.level
          AND tr.term=p.term
      ) AS student_count
    FROM result_publication p
    JOIN department d ON d.department_id=p.department_id
    LEFT JOIN admin_public a ON a.admin_id=p.published_by_admin_id
    ORDER BY p.last_published_at DESC
  `);

  res.json(result.rows);
}));

// Who would be published and who is excluded (and why).
router.get('/preview', wrap(async (req, res) => {
  const s = await scope(pool, req.query);

  res.json({
    department: s.department,
    ...await evaluate(pool, s.department.department_id, s.level, s.term)
  });
}));

router.post('/publish', wrap(async (req, res) => {
  const result = await transaction(async db => {
    const s = await scope(db, req.body);

    const evaluation = await publish(
      db,
      s.department.department_id,
      s.level,
      s.term,
      req.admin.admin_id
    );

    const published = evaluation.students.filter(x => x.state === 'eligible');

    await log(
      db,
      req.admin.admin_id,
      'result_publication',
      s.department.department_id,
      'PUBLISH',
      `Published ${s.department.department_code} ${evaluation.label} results ` +
        `for ${published.length} student(s); ` +
        `${evaluation.students.filter(x => x.state === 'excluded').length} excluded`
    );

    return { department: s.department, ...evaluation };
  });

  res.json(result);
}));

module.exports = router;
