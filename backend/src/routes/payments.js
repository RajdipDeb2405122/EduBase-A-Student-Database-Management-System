const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all payments
router.get('/', async (req, res) => {
  try {
    const { student_id, academic_year, term, status } = req.query;
    let query = `
      SELECT pay.*, s.registration_no, s.full_name as student_name
      FROM payment pay
      JOIN student s ON pay.student_id = s.student_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (student_id) {
      query += ` AND pay.student_id = $${paramIndex}`;
      params.push(student_id);
      paramIndex++;
    }
    if (academic_year) {
      query += ` AND pay.academic_year = $${paramIndex}`;
      params.push(academic_year);
      paramIndex++;
    }
    if (term) {
      query += ` AND pay.term = $${paramIndex}`;
      params.push(term);
      paramIndex++;
    }
    if (status) {
      query += ` AND pay.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ' ORDER BY pay.paid_on DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get payment by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT pay.*, s.registration_no, s.full_name as student_name
      FROM payment pay
      JOIN student s ON pay.student_id = s.student_id
      WHERE pay.payment_id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create payment
router.post('/', auth, async (req, res) => {
  try {
    const { student_id, academic_year, term, payment_type, amount, paid_on, status } = req.body;

    const result = await pool.query(
      `INSERT INTO payment (student_id, academic_year, term, payment_type, amount, paid_on, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [student_id, academic_year, term, payment_type, amount, paid_on || new Date(), status || 'paid']
    );

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'payment', $2, 'CREATE', $3)`,
      [req.admin.admin_id, result.rows[0].payment_id, `Recorded payment: ${payment_type} - ${amount}`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update payment
router.put('/:id', auth, async (req, res) => {
  try {
    const { academic_year, term, payment_type, amount, paid_on, status } = req.body;

    const result = await pool.query(
      `UPDATE payment SET academic_year = $1, term = $2, payment_type = $3,
       amount = $4, paid_on = $5, status = $6
       WHERE payment_id = $7 RETURNING *`,
      [academic_year, term, payment_type, amount, paid_on, status, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'payment', $2, 'UPDATE', $3)`,
      [req.admin.admin_id, req.params.id, `Updated payment`]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete payment
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM payment WHERE payment_id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, old_value)
       VALUES ($1, 'payment', $2, 'DELETE', $3)`,
      [req.admin.admin_id, req.params.id, `Deleted payment record`]
    );

    res.json({ message: 'Payment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get payment summary
router.get('/summary/total', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_payments,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(AVG(amount), 0) as average_amount
      FROM payment
      WHERE status = 'paid'
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
