const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all pending registration requests
router.get('/pending', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, p.program_name
      FROM student_registration_requests r
      LEFT JOIN program p ON r.program_id = p.program_id
      WHERE r.status = 'pending'
      ORDER BY r.requested_on DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all requests (with filters)
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT r.*, p.program_name, a.full_name as reviewed_by_name
      FROM student_registration_requests r
      LEFT JOIN program p ON r.program_id = p.program_id
      LEFT JOIN admin a ON r.reviewed_by_admin_id = a.admin_id
    `;
    
    const params = [];
    if (status) {
      query += ' WHERE r.status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY r.requested_on DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve registration request
router.put('/:id/approve', auth, async (req, res) => {
  try {
    const { advisor_id } = req.body;
    
    const requestResult = await pool.query(
      'SELECT * FROM student_registration_requests WHERE request_id = $1 AND status = $2',
      [req.params.id, 'pending']
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found or already processed' });
    }

    const request = requestResult.rows[0];

    // Create the student
    const studentResult = await pool.query(
      `INSERT INTO student (program_id, advisor_id, verified_by_admin_id, registration_no, 
        full_name, email, phone, date_of_birth, admission_date, current_status, current_cgpa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE, 'active', 0.00) RETURNING *`,
      [request.program_id, advisor_id || null, req.admin.admin_id, 
       request.registration_no, request.full_name, request.email, 
       request.phone, request.date_of_birth]
    );

    // Update request status
    await pool.query(
      `UPDATE student_registration_requests 
       SET status = 'approved', reviewed_by_admin_id = $1, reviewed_on = CURRENT_TIMESTAMP
       WHERE request_id = $2`,
      [req.admin.admin_id, req.params.id]
    );

    // Log admin action
    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'student', $2, 'CREATE', $3)`,
      [req.admin.admin_id, studentResult.rows[0].student_id, 
       `Approved registration: ${request.full_name} (${request.email})`]
    );

    res.json({ 
      message: 'Registration approved! Student account created.',
      student: studentResult.rows[0]
    });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reject registration request
router.put('/:id/reject', auth, async (req, res) => {
  try {
    const { rejection_reason } = req.body;

    const result = await pool.query(
      `UPDATE student_registration_requests 
       SET status = 'rejected', reviewed_by_admin_id = $1, 
           reviewed_on = CURRENT_TIMESTAMP, rejection_reason = $2
       WHERE request_id = $3 AND status = 'pending'
       RETURNING *`,
      [req.admin.admin_id, rejection_reason, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found or already processed' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, old_value)
       VALUES ($1, 'student_registration_requests', $2, 'REJECT', $3)`,
      [req.admin.admin_id, req.params.id, 
       `Rejected: ${result.rows[0].full_name} - ${rejection_reason}`]
    );

    res.json({ message: 'Registration request rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete request
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM student_registration_requests WHERE request_id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    res.json({ message: 'Request deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;