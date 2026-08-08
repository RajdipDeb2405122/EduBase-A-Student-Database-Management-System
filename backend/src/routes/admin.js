const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all admins
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT admin_id, username, full_name, email, role, status, last_login
      FROM admin ORDER BY role, full_name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get admin by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT admin_id, username, full_name, email, role, status, last_login
      FROM admin WHERE admin_id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create admin
router.post('/', auth, async (req, res) => {
  try {
    const { username, password, full_name, email, role } = req.body;

    // Check if username exists
    const existing = await pool.query('SELECT admin_id FROM admin WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO admin (username, password_hash, full_name, email, role, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING admin_id, username, full_name, email, role, status`,
      [username, hashedPassword, full_name, email, role || 'admin']
    );

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'admin', $2, 'CREATE', $3)`,
      [req.admin.admin_id, result.rows[0].admin_id, `Created admin: ${full_name} (${username})`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update admin
router.put('/:id', auth, async (req, res) => {
  try {
    const { full_name, email, role, status } = req.body;

    const result = await pool.query(
      `UPDATE admin SET full_name = $1, email = $2, role = $3, status = $4
       WHERE admin_id = $5 RETURNING admin_id, username, full_name, email, role, status`,
      [full_name, email, role, status, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'admin', $2, 'UPDATE', $3)`,
      [req.admin.admin_id, req.params.id, `Updated admin: ${full_name}`]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete admin
router.delete('/:id', auth, async (req, res) => {
  try {
    // Prevent self-deletion
    if (parseInt(req.params.id) === req.admin.admin_id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await pool.query(
      'DELETE FROM admin WHERE admin_id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, old_value)
       VALUES ($1, 'admin', $2, 'DELETE', $3)`,
      [req.admin.admin_id, req.params.id, `Deleted admin: ${result.rows[0].username}`]
    );

    res.json({ message: 'Admin deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset admin password
router.post('/:id/reset-password', auth, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE admin SET password_hash = $1 WHERE admin_id = $2',
      [hashedPassword, req.params.id]
    );

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'admin', $2, 'UPDATE', $3)`,
      [req.admin.admin_id, req.params.id, 'Password reset']
    );

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get admin action logs
router.get('/logs/recent', auth, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const result = await pool.query(`
      SELECT l.*, a.username, a.full_name as admin_name
      FROM admin_action_log l
      LEFT JOIN admin a ON l.admin_id = a.admin_id
      ORDER BY l.action_timestamp DESC
      LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
