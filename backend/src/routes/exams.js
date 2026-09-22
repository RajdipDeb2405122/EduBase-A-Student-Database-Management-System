const router = require('express').Router();
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap, check, id, date, transaction, log
} = require('../lib/common');

const {
  resultsSQL, saveResult, legacyDefinition, ensureExamPublishTables
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

// Result-publication requests sent by faculty.
// Registered before GET /:id so "publish-requests" is not
// parsed as a numeric ID. One request covers a whole exam;
// the admin may only Accept/Reject it.
router.get('/publish-requests', wrap(async (req, res) => {
  await ensureExamPublishTables();

  const status = req.query.status || null;

  check(
    !status || ['pending', 'approved', 'rejected'].includes(status),
    'Invalid status'
  );

  const result = await pool.query(`
    SELECT
      q.*,
      x.exam_type,
      x.exam_date,
      x.academic_year,
      x.term,
      x.published,
      c.course_code,
      c.course_title,
      f.full_name AS faculty_name,
      r.full_name AS reviewed_by_name,
      (
        SELECT count(*)::int
        FROM exam_result er
        WHERE er.exam_id=q.exam_id
          AND er.obtained_marks IS NOT NULL
      ) AS graded_count,
      (
        SELECT count(*)::int
        FROM exam_result er
        WHERE er.exam_id=q.exam_id
      ) AS student_count

    FROM exam_publish_requests q

    JOIN exam x
      ON x.exam_id=q.exam_id

    JOIN course c
      ON c.course_id=x.course_id

    JOIN faculty_public f
      ON f.faculty_id=q.faculty_id

    LEFT JOIN admin_public r
      ON r.admin_id=q.reviewed_by_admin_id

    WHERE ($1::text IS NULL OR q.status=$1)

    ORDER BY (q.status='pending') DESC, q.requested_on DESC
  `, [status]);

  res.json(result.rows);
}));

const reviewPublishRequest = decision => wrap(async (req, res) => {
  await ensureExamPublishTables();

  const message = await transaction(async db => {
    const found = await db.query(`
      SELECT request_id, exam_id
      FROM exam_publish_requests
      WHERE request_id=$1
        AND status='pending'
      FOR UPDATE
    `, [id(req.params.id, 'request')]);

    check(
      found.rowCount,
      'Request not found or already reviewed',
      409
    );

    const total = await db.query(`
      SELECT count(*)::int AS n
      FROM exam_result
      WHERE exam_id=$1
    `, [found.rows[0].exam_id]);

    const students = total.rows[0].n;

    await db.query(`
      UPDATE exam_publish_requests
      SET status=$1,
          reviewed_by_admin_id=$2,
          reviewed_on=CURRENT_TIMESTAMP
      WHERE request_id=$3
    `, [
      decision,
      req.admin.admin_id,
      found.rows[0].request_id
    ]);

    if (decision === 'approved') {
      // Students whose marks were never entered count as 0.
      // 0 marks always grade to F.
      await db.query(`
        UPDATE exam_result
        SET obtained_marks=0,
            grade='F',
            updated_at=CURRENT_TIMESTAMP
        WHERE exam_id=$1
          AND obtained_marks IS NULL
      `, [found.rows[0].exam_id]);

      // Every student's result for this exam is published together.
      await db.query(
        'UPDATE exam SET published=TRUE WHERE exam_id=$1',
        [found.rows[0].exam_id]
      );
    }

    await log(
      db,
      req.admin.admin_id,
      'exam_publish_requests',
      found.rows[0].request_id,
      decision === 'approved' ? 'APPROVE' : 'REJECT',
      decision === 'approved'
        ? 'Approved exam publication; all student results published, blank marks recorded as 0'
        : 'Rejected exam publication request'
    );

    return decision === 'approved'
      ? `Accepted. All ${students} student results for this exam are now published. Blank marks were recorded as 0.`
      : 'Publication request rejected.';
  });

  res.json({ message });
});

router.put(
  '/publish-requests/:id/approve',
  reviewPublishRequest('approved')
);

router.put(
  '/publish-requests/:id/reject',
  reviewPublishRequest('rejected')
);

router.get('/:id', wrap(async (req, res) => {
  const r = await pool.query(`
    ${resultsSQL} WHERE r.result_id=$1
  `, [id(req.params.id)]);

  check(r.rowCount, 'Result not found', 404);
  res.json(r.rows[0]);
}));

// NOTE: the administrator "Record Exam" creation endpoint
// (POST /) was removed on purpose. Exams and marks are entered
// by faculty in the faculty portal; here the admin only reviews
// publication requests and reads results.

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