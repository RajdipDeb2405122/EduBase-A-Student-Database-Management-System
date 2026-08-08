const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all courses
router.get('/', async (req, res) => {
  try {
    const { program_id, active } = req.query;
    let query = `
      SELECT c.*, p.program_name, f.full_name as faculty_name
      FROM course c
      LEFT JOIN program p ON c.program_id = p.program_id
      LEFT JOIN faculty f ON c.faculty_id = f.faculty_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (program_id) {
      query += ` AND c.program_id = $${paramIndex}`;
      params.push(program_id);
      paramIndex++;
    }
    if (active !== undefined) {
      query += ` AND c.active = $${paramIndex}`;
      params.push(active === 'true');
      paramIndex++;
    }

    query += ' ORDER BY c.course_code';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get course by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, p.program_name, f.full_name as faculty_name
      FROM course c
      LEFT JOIN program p ON c.program_id = p.program_id
      LEFT JOIN faculty f ON c.faculty_id = f.faculty_id
      WHERE c.course_id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get course by code
router.get('/code/:code', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, p.program_name, f.full_name as faculty_name
      FROM course c
      LEFT JOIN program p ON c.program_id = p.program_id
      LEFT JOIN faculty f ON c.faculty_id = f.faculty_id
      WHERE c.course_code = $1
    `, [req.params.code]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create course
router.post('/', auth, async (req, res) => {
  try {
    const { program_id, faculty_id, course_code, course_title, credit_hours,
            term_no, course_type, active } = req.body;

    const result = await pool.query(
      `INSERT INTO course (program_id, faculty_id, course_code, course_title, 
        credit_hours, term_no, course_type, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [program_id, faculty_id, course_code, course_title, credit_hours,
       term_no, course_type, active !== false]
    );

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'course', $2, 'CREATE', $3)`,
      [req.admin.admin_id, result.rows[0].course_id, `Created course: ${course_code} - ${course_title}`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update course
router.put('/:id', auth, async (req, res) => {
  try {
    const { program_id, faculty_id, course_code, course_title, credit_hours,
            term_no, course_type, active } = req.body;

    const result = await pool.query(
      `UPDATE course SET program_id = $1, faculty_id = $2, course_code = $3,
       course_title = $4, credit_hours = $5, term_no = $6, course_type = $7, active = $8
       WHERE course_id = $9 RETURNING *`,
      [program_id, faculty_id, course_code, course_title, credit_hours,
       term_no, course_type, active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'course', $2, 'UPDATE', $3)`,
      [req.admin.admin_id, req.params.id, `Updated course: ${course_code}`]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete course
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM course WHERE course_id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, old_value)
       VALUES ($1, 'course', $2, 'DELETE', $3)`,
      [req.admin.admin_id, req.params.id, `Deleted course: ${result.rows[0].course_code}`]
    );

    res.json({ message: 'Course deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
