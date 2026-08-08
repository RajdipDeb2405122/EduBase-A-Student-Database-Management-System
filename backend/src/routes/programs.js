const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all programs
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, d.department_name 
      FROM program p 
      LEFT JOIN department d ON p.department_id = d.department_id 
      ORDER BY p.program_name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get program by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, d.department_name 
      FROM program p 
      LEFT JOIN department d ON p.department_id = d.department_id 
      WHERE p.program_id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get programs by department
router.get('/department/:deptId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM program WHERE department_id = $1 ORDER BY program_name',
      [req.params.deptId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create program
router.post('/', auth, async (req, res) => {
  try {
    const { department_id, program_name, degree_level, duration_years, total_credits } = req.body;
    const result = await pool.query(
      `INSERT INTO program (department_id, program_name, degree_level, duration_years, total_credits)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [department_id, program_name, degree_level, duration_years, total_credits]
    );

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'program', $2, 'CREATE', $3)`,
      [req.admin.admin_id, result.rows[0].program_id, `Created program: ${program_name}`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update program
router.put('/:id', auth, async (req, res) => {
  try {
    const { department_id, program_name, degree_level, duration_years, total_credits } = req.body;
    const result = await pool.query(
      `UPDATE program SET department_id = $1, program_name = $2, degree_level = $3, 
       duration_years = $4, total_credits = $5 WHERE program_id = $6 RETURNING *`,
      [department_id, program_name, degree_level, duration_years, total_credits, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'program', $2, 'UPDATE', $3)`,
      [req.admin.admin_id, req.params.id, `Updated program: ${program_name}`]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete program
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM program WHERE program_id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, old_value)
       VALUES ($1, 'program', $2, 'DELETE', $3)`,
      [req.admin.admin_id, req.params.id, `Deleted program: ${result.rows[0].program_name}`]
    );

    res.json({ message: 'Program deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
