const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');
const { transaction, check } = require('../lib/common');

const router = express.Router();

// Get all departments
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM department ORDER BY department_name'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get department by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM department WHERE department_id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create department (admin only)
router.post('/', auth, async (req, res) => {
  try {
    const { department_name, office_location, phone } = req.body;
    const result = await transaction(async db => {
      const result = await db.query(
        `INSERT INTO department (department_name, office_location, phone) 
         VALUES ($1, $2, $3) RETURNING *`,
        [department_name, office_location, phone]
      );

      // Log action
      await db.query(
        `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
         VALUES ($1, 'department', $2, 'CREATE', $3)`,
        [req.admin.admin_id, result.rows[0].department_id, `Created department: ${department_name}`]
      );

      return result;
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Update department
router.put('/:id', auth, async (req, res) => {
  try {
    const { department_name, office_location, phone } = req.body;
    const result = await transaction(async db => {
      const result = await db.query(
        `UPDATE department SET department_name = $1, office_location = $2, phone = $3
         WHERE department_id = $4 RETURNING *`,
        [department_name, office_location, phone, req.params.id]
      );

      check(result.rows.length > 0, 'Department not found', 404);

      await db.query(
        `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
         VALUES ($1, 'department', $2, 'UPDATE', $3)`,
        [req.admin.admin_id, req.params.id, `Updated department: ${department_name}`]
      );

      return result;
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Delete department
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await transaction(async db => {
      const result = await db.query(
        'DELETE FROM department WHERE department_id = $1 RETURNING *',
        [req.params.id]
      );

      check(result.rows.length > 0, 'Department not found', 404);

      await db.query(
        `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, old_value)
         VALUES ($1, 'department', $2, 'DELETE', $3)`,
        [req.admin.admin_id, req.params.id, `Deleted department: ${result.rows[0].department_name}`]
      );

      return result;
    });

    res.json({ message: 'Department deleted successfully' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
