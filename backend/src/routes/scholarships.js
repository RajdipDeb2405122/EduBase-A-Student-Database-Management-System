const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const {
  wrap,
  check,
  id,
  transaction,
  log
} = require('../lib/common');

const {
  ensureScholarshipTables
} = require('../lib/scholarships');

const router = express.Router();

// Get all awarded scholarships
router.get('/', async (req, res) => {
  try {
    const { student_id, status } = req.query;
    let query = `
      SELECT sch.*, s.registration_no, s.full_name as student_name
      FROM scholarship sch
      JOIN student s ON sch.student_id = s.student_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (student_id) {
      query += ` AND sch.student_id = $${paramIndex}`;
      params.push(student_id);
      paramIndex++;
    }
    if (status) {
      query += ` AND sch.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ' ORDER BY sch.awarded_on DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student applications awaiting an admin Accept/Reject decision.
// Registered before GET /:id so "applications" is not parsed as an ID.
router.get('/applications', wrap(async (req, res) => {
  await ensureScholarshipTables();

  const status = req.query.status || null;

  check(
    !status || ['pending', 'approved', 'rejected'].includes(status),
    'Invalid status'
  );

  const result = await pool.query(`
    SELECT
      a.*,
      s.registration_no,
      s.full_name AS student_name,
      r.full_name AS reviewed_by_name

    FROM scholarship_application a

    JOIN student s
      ON s.student_id=a.student_id

    LEFT JOIN admin_public r
      ON r.admin_id=a.reviewed_by_admin_id

    WHERE ($1::text IS NULL OR a.status=$1)

    ORDER BY (a.status='pending') DESC, a.applied_on DESC
  `, [status]);

  res.json(result.rows);
}));

// Accept an application: the fixed predefined scholarship
// is then awarded to the student.
router.put(
  '/applications/:id/approve',
  auth,
  wrap(async (req, res) => {
    await ensureScholarshipTables();

    const scholarship = await transaction(async db => {
      const found = await db.query(`
        SELECT *
        FROM scholarship_application
        WHERE application_id=$1
          AND status='pending'
        FOR UPDATE
      `, [id(req.params.id, 'application')]);

      check(
        found.rowCount,
        'Application not found or already reviewed',
        409
      );

      const application = found.rows[0];

      await db.query(`
        UPDATE scholarship_application
        SET status='approved',
            reviewed_by_admin_id=$1,
            reviewed_on=CURRENT_TIMESTAMP
        WHERE application_id=$2
      `, [
        req.admin.admin_id,
        application.application_id
      ]);

      const awarded = await db.query(`
        INSERT INTO scholarship (
          student_id,
          scholarship_name,
          award_type,
          amount,
          awarded_on,
          status
        )
        VALUES ($1, $2, $3, $4, CURRENT_DATE, 'active')
        RETURNING *
      `, [
        application.student_id,
        application.scholarship_name,
        application.award_type,
        application.amount
      ]);

      await log(
        db,
        req.admin.admin_id,
        'scholarship_application',
        application.application_id,
        'APPROVE',
        `Accepted application and awarded: ${application.scholarship_name}`
      );

      return awarded.rows[0];
    });

    res.json({
      message: 'Application accepted. Scholarship awarded to the student.',
      scholarship
    });
  })
);

// Reject an application.
router.put(
  '/applications/:id/reject',
  auth,
  wrap(async (req, res) => {
    await ensureScholarshipTables();

    await transaction(async db => {
      const found = await db.query(`
        SELECT *
        FROM scholarship_application
        WHERE application_id=$1
          AND status='pending'
        FOR UPDATE
      `, [id(req.params.id, 'application')]);

      check(
        found.rowCount,
        'Application not found or already reviewed',
        409
      );

      await db.query(`
        UPDATE scholarship_application
        SET status='rejected',
            reviewed_by_admin_id=$1,
            reviewed_on=CURRENT_TIMESTAMP
        WHERE application_id=$2
      `, [
        req.admin.admin_id,
        found.rows[0].application_id
      ]);

      await log(
        db,
        req.admin.admin_id,
        'scholarship_application',
        found.rows[0].application_id,
        'REJECT',
        `Rejected application: ${found.rows[0].scholarship_name}`
      );
    });

    res.json({ message: 'Application rejected' });
  })
);

// Get scholarship by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sch.*, s.registration_no, s.full_name as student_name
      FROM scholarship sch
      JOIN student s ON sch.student_id = s.student_id
      WHERE sch.scholarship_id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scholarship not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NOTE: the administrator "Award Scholarship" creation endpoint
// (POST /) was removed on purpose. Scholarships are only created
// when the admin accepts a student's application above.

// Update scholarship
router.put('/:id', auth, async (req, res) => {
  try {
    const { scholarship_name, award_type, amount, awarded_on, valid_until, status } = req.body;

    const result = await transaction(async db => {
      const result = await db.query(
        `UPDATE scholarship SET scholarship_name = $1, award_type = $2, amount = $3,
         awarded_on = $4, valid_until = $5, status = $6
         WHERE scholarship_id = $7 RETURNING *`,
        [scholarship_name, award_type, amount, awarded_on, valid_until, status, req.params.id]
      );

      check(result.rows.length > 0, 'Scholarship not found', 404);

      await db.query(
        `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
         VALUES ($1, 'scholarship', $2, 'UPDATE', $3)`,
        [req.admin.admin_id, req.params.id, `Updated scholarship: ${scholarship_name}`]
      );

      return result;
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Delete scholarship
router.delete('/:id', auth, async (req, res) => {
  try {
    await transaction(async db => {
      const result = await db.query(
        'DELETE FROM scholarship WHERE scholarship_id = $1 RETURNING *',
        [req.params.id]
      );

      check(result.rows.length > 0, 'Scholarship not found', 404);

      await db.query(
        `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, old_value)
         VALUES ($1, 'scholarship', $2, 'DELETE', $3)`,
        [req.admin.admin_id, req.params.id, `Removed scholarship: ${result.rows[0].scholarship_name}`]
      );
    });

    res.json({ message: 'Scholarship deleted successfully' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;