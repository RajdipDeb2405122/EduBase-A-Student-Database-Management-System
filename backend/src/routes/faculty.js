const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all faculty
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, d.department_name 
      FROM faculty f 
      LEFT JOIN department d ON f.department_id = d.department_id 
      ORDER BY f.full_name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get faculty by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, d.department_name 
      FROM faculty f 
      LEFT JOIN department d ON f.department_id = d.department_id 
      WHERE f.faculty_id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Faculty not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get faculty by department
router.get('/department/:deptId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM faculty WHERE department_id = $1 ORDER BY full_name',
      [req.params.deptId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create faculty
router.post('/', auth, async (req, res) => {
  try {
    const { department_id, full_name, email, designation, phone } = req.body;
    const result = await pool.query(
      `INSERT INTO faculty (department_id, full_name, email, designation, phone)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [department_id, full_name, email, designation, phone]
    );

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'faculty', $2, 'CREATE', $3)`,
      [req.admin.admin_id, result.rows[0].faculty_id, `Added faculty: ${full_name}`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update faculty
router.put('/:id', auth, async (req, res) => {
  try {
    const { department_id, full_name, email, designation, phone } = req.body;
    const result = await pool.query(
      `UPDATE faculty SET department_id = $1, full_name = $2, email = $3, 
       designation = $4, phone = $5 WHERE faculty_id = $6 RETURNING *`,
      [department_id, full_name, email, designation, phone, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'faculty', $2, 'UPDATE', $3)`,
      [req.admin.admin_id, req.params.id, `Updated faculty: ${full_name}`]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete faculty
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM faculty WHERE faculty_id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, old_value)
       VALUES ($1, 'faculty', $2, 'DELETE', $3)`,
      [req.admin.admin_id, req.params.id, `Deleted faculty: ${result.rows[0].full_name}`]
    );

    res.json({ message: 'Faculty deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
