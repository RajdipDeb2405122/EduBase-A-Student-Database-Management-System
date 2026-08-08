const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all enrollments
router.get('/', async (req, res) => {
  try {
    const { academic_year, term, status, student_id } = req.query;
    let query = `
      SELECT e.*, s.registration_no, s.full_name as student_name,
             c.course_code, c.course_title,
             a.full_name as authorized_by_name
      FROM enrollment e
      JOIN student s ON e.student_id = s.student_id
      JOIN course c ON e.course_id = c.course_id
      LEFT JOIN admin a ON e.authorized_by_admin_id = a.admin_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (academic_year) {
      query += ` AND e.academic_year = $${paramIndex}`;
      params.push(academic_year);
      paramIndex++;
    }
    if (term) {
      query += ` AND e.term = $${paramIndex}`;
      params.push(term);
      paramIndex++;
    }
    if (status) {
      query += ` AND e.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    if (student_id) {
      query += ` AND e.student_id = $${paramIndex}`;
      params.push(student_id);
      paramIndex++;
    }

    query += ' ORDER BY e.academic_year DESC, e.term, s.registration_no';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get enrollment by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*, s.registration_no, s.full_name as student_name,
             c.course_code, c.course_title, c.credit_hours,
             a.full_name as authorized_by_name
      FROM enrollment e
      JOIN student s ON e.student_id = s.student_id
      JOIN course c ON e.course_id = c.course_id
      LEFT JOIN admin a ON e.authorized_by_admin_id = a.admin_id
      WHERE e.enrollment_id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create enrollment
router.post('/', auth, async (req, res) => {
  try {
    const { student_id, course_id, academic_year, term, enrolled_on } = req.body;

    // Check for duplicate
    const existing = await pool.query(
      'SELECT * FROM enrollment WHERE student_id = $1 AND course_id = $2 AND academic_year = $3 AND term = $4',
      [student_id, course_id, academic_year, term]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Student already enrolled in this course for this term' });
    }

    const result = await pool.query(
      `INSERT INTO enrollment (student_id, course_id, authorized_by_admin_id, 
        academic_year, term, enrolled_on, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'enrolled') RETURNING *`,
      [student_id, course_id, req.admin.admin_id, academic_year, term, enrolled_on]
    );

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'enrollment', $2, 'AUTHORIZE', $3)`,
      [req.admin.admin_id, result.rows[0].enrollment_id, 
       `Authorized enrollment for student ${student_id} in course ${course_id}`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update enrollment status
router.put('/:id', auth, async (req, res) => {
  try {
    const { status } = req.body;

    const result = await pool.query(
      'UPDATE enrollment SET status = $1 WHERE enrollment_id = $2 RETURNING *',
      [status, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'enrollment', $2, 'UPDATE', $3)`,
      [req.admin.admin_id, req.params.id, `Enrollment status changed to: ${status}`]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete enrollment
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM enrollment WHERE enrollment_id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, old_value)
       VALUES ($1, 'enrollment', $2, 'DELETE', $3)`,
      [req.admin.admin_id, req.params.id, 'Enrollment removed']
    );

    res.json({ message: 'Enrollment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
