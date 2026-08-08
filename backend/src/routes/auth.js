const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await pool.query(
      'SELECT * FROM admin WHERE username = $1 AND status = $2',
      [username, 'active']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = result.rows[0];
    const isMatch = await bcrypt.compare(password, admin.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query(
      'UPDATE admin SET last_login = CURRENT_TIMESTAMP WHERE admin_id = $1',
      [admin.admin_id]
    );

    // Generate token
    const token = jwt.sign(
      { admin_id: admin.admin_id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET || 'edubase_jwt_secret_key_2024',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      admin: {
        admin_id: admin.admin_id,
        username: admin.username,
        full_name: admin.full_name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current admin profile
router.get('/me', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'edubase_jwt_secret_key_2024');
    const result = await pool.query(
      'SELECT admin_id, username, full_name, email, role, status, last_login FROM admin WHERE admin_id = $1',
      [decoded.admin_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Change password
router.post('/change-password', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'edubase_jwt_secret_key_2024');
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    const result = await pool.query('SELECT password_hash FROM admin WHERE admin_id = $1', [decoded.admin_id]);
    const isMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);

    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE admin SET password_hash = $1 WHERE admin_id = $2', [hashedPassword, decoded.admin_id]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
