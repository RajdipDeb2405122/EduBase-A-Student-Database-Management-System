const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all scholarships
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

// Create scholarship
router.post('/', auth, async (req, res) => {
  try {
    const { student_id, scholarship_name, award_type, amount, awarded_on, valid_until, status } = req.body;

    const result = await pool.query(
      `INSERT INTO scholarship (student_id, scholarship_name, award_type, amount, awarded_on, valid_until, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [student_id, scholarship_name, award_type, amount, awarded_on, valid_until, status || 'active']
    );

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'scholarship', $2, 'CREATE', $3)`,
      [req.admin.admin_id, result.rows[0].scholarship_id, `Awarded scholarship: ${scholarship_name}`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update scholarship
router.put('/:id', auth, async (req, res) => {
  try {
    const { scholarship_name, award_type, amount, awarded_on, valid_until, status } = req.body;

    const result = await pool.query(
      `UPDATE scholarship SET scholarship_name = $1, award_type = $2, amount = $3,
       awarded_on = $4, valid_until = $5, status = $6
       WHERE scholarship_id = $7 RETURNING *`,
      [scholarship_name, award_type, amount, awarded_on, valid_until, status, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scholarship not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'scholarship', $2, 'UPDATE', $3)`,
      [req.admin.admin_id, req.params.id, `Updated scholarship: ${scholarship_name}`]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete scholarship
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM scholarship WHERE scholarship_id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scholarship not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, old_value)
       VALUES ($1, 'scholarship', $2, 'DELETE', $3)`,
      [req.admin.admin_id, req.params.id, `Removed scholarship: ${result.rows[0].scholarship_name}`]
    );

    res.json({ message: 'Scholarship deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
