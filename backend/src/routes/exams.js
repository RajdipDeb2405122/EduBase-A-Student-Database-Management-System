const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap, check, id, date, transaction, log
} = require('../lib/common');

const {
  resultsSQL, saveResult, legacyDefinition
} = require('../lib/exams');

router.use(auth, auth.requireAdmin);

router.get('/', wrap(async (req, res) => {
  const values = [];
  const where = [];

  if (req.query.enrollment_id) {
    values.push(id(req.query.enrollment_id));
    where.push(`r.enrollment_id=$${values.length}`);
  }

  if (req.query.exam_type) {
    values.push(req.query.exam_type);
    where.push(`x.exam_type=$${values.length}`);
  }

  const r = await pool.query(`
    ${resultsSQL}
    ${where.length ? ' WHERE ' + where.join(' AND ') : ''}
    ORDER BY x.exam_date DESC NULLS LAST,r.result_id DESC
  `, values);

  res.json(r.rows);
}));

router.get('/:id', wrap(async (req, res) => {
  const r = await pool.query(`
    ${resultsSQL} WHERE r.result_id=$1
  `, [id(req.params.id)]);

  check(r.rowCount, 'Result not found', 404);
  res.json(r.rows[0]);
}));

router.post('/', wrap(async (req, res) => {
  const result = await transaction(async db => {
    const exam = await legacyDefinition(
      db,
      req.body.enrollment_id,
      req.body
    );

    const exists = await db.query(`
      SELECT 1 FROM exam_result
      WHERE exam_id=$1 AND enrollment_id=$2
    `, [exam.exam_id, id(req.body.enrollment_id)]);

    check(
      !exists.rowCount,
      'A result already exists for this student and exam',
      409
    );

    const r = await saveResult(
      db, exam, req.body.enrollment_id, req.body
    );

    await log(
      db, req.admin.admin_id, 'exam_result',
      r.result_id, 'CREATE', 'Recorded exam result'
    );

    return (
      await db.query(
        `${resultsSQL} WHERE r.result_id=$1`,
        [r.result_id]
      )
    ).rows[0];
  });

  res.status(201).json(result);
}));

router.put('/:id', wrap(async (req, res) => {
  const result = await transaction(async db => {
    const found = await db.query(`
      SELECT
        r.*,x.exam_type,x.exam_date,x.total_marks,
        x.course_id,x.academic_year,x.term
      FROM exam_result r
      JOIN exam x ON x.exam_id=r.exam_id
      WHERE r.result_id=$1
      FOR UPDATE OF r,x
    `, [id(req.params.id)]);

    check(found.rowCount, 'Result not found', 404);

    const old = found.rows[0];
    const body = { ...old, ...req.body };
    const oldDate = date(old.exam_date);

    const changed =
      (
        req.body.exam_type !== undefined &&
        req.body.exam_type !== old.exam_type
      ) ||
      (
        req.body.exam_date !== undefined &&
        (req.body.exam_date || null) !== oldDate
      ) ||
      (
        req.body.total_marks !== undefined &&
        Number(req.body.total_marks) !== Number(old.total_marks)
      );

    let exam = old;

    // An old-style update edits one student's result,
    // not every student's shared exam definition.
    if (changed) {
      exam = await legacyDefinition(db, old.enrollment_id, body);

      const duplicate = await db.query(`
        SELECT 1 FROM exam_result
        WHERE exam_id=$1 AND student_id=$2 AND result_id<>$3
      `, [exam.exam_id, old.student_id, old.result_id]);

      check(
        !duplicate.rowCount,
        'That student already has a result for the selected exam',
        409
      );
    }

    const r = await saveResult(
      db,
      exam,
      old.enrollment_id,
      body,
      false,
      old.result_id
    );

    await log(
      db, req.admin.admin_id, 'exam_result',
      r.result_id, 'UPDATE', 'Updated exam result'
    );

    return (
      await db.query(
        `${resultsSQL} WHERE r.result_id=$1`,
        [r.result_id]
      )
    ).rows[0];
  });

  res.json(result);
}));

router.delete('/:id', wrap(async (req, res) => {
  await transaction(async db => {
    const r = await db.query(`
      DELETE FROM exam_result
      WHERE result_id=$1
      RETURNING result_id
    `, [id(req.params.id)]);

    check(r.rowCount, 'Result not found', 404);

    await log(
      db, req.admin.admin_id, 'exam_result',
      id(req.params.id), 'DELETE', 'Deleted exam result'
    );
  });

  res.json({ message: 'Exam result deleted' });
}));

module.exports = router;