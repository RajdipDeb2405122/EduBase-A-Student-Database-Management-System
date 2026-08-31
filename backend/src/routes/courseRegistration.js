const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Student requests course registration
router.post('/request', auth, async (req, res) => {
  try {
    const { student_id, course_id, academic_year, term } = req.body;

    // Check if already enrolled or has pending request
    const existing = await pool.query(
      `SELECT * FROM enrollment WHERE student_id = $1 AND course_id = $2 AND academic_year = $3 AND term = $4`,
      [student_id, course_id, academic_year, term]
    );
    
    const existingRequest = await pool.query(
      `SELECT * FROM course_registration_requests 
       WHERE student_id = $1 AND course_id = $2 AND academic_year = $3 AND term = $4 AND status = 'pending'`,
      [student_id, course_id, academic_year, term]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Already enrolled in this course' });
    }
    
    if (existingRequest.rows.length > 0) {
      return res.status(400).json({ error: 'Request already pending' });
    }

    const result = await pool.query(
      `INSERT INTO course_registration_requests 
       (student_id, course_id, academic_year, term, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [student_id, course_id, academic_year, term]
    );

    res.status(201).json({
      message: 'Course registration request submitted!',
      request: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all pending course requests (admin)
router.get('/pending', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT crr.*, c.course_code, c.course_title, c.credit_hours,
             s.registration_no, s.full_name as student_name, s.email as student_email,
             p.program_name
      FROM course_registration_requests crr
      JOIN course c ON crr.course_id = c.course_id
      JOIN student s ON crr.student_id = s.student_id
      JOIN program p ON s.program_id = p.program_id
      WHERE crr.status = 'pending'
      ORDER BY crr.requested_on DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all requests (admin with filter)
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT crr.*, c.course_code, c.course_title,
             s.registration_no, s.full_name as student_name,
             a.full_name as reviewed_by_name
      FROM course_registration_requests crr
      JOIN course c ON crr.course_id = c.course_id
      JOIN student s ON crr.student_id = s.student_id
      LEFT JOIN admin a ON crr.reviewed_by_admin_id = a.admin_id
    `;
    const params = [];
    if (status) {
      query += ' WHERE crr.status = $1';
      params.push(status);
    }
    query += ' ORDER BY crr.requested_on DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve course registration
router.put('/:id/approve', auth, async (req, res) => {
  try {
    const requestResult = await pool.query(
      'SELECT * FROM course_registration_requests WHERE request_id = $1 AND status = $2',
      [req.params.id, 'pending']
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found or already processed' });
    }

    const request = requestResult.rows[0];

    // Create enrollment
    await pool.query(
      `INSERT INTO enrollment (student_id, course_id, authorized_by_admin_id, academic_year, term, status)
       VALUES ($1, $2, $3, $4, $5, 'enrolled')`,
      [request.student_id, request.course_id, req.admin.admin_id, request.academic_year, request.term]
    );

    // Update request status
    await pool.query(
      `UPDATE course_registration_requests 
       SET status = 'approved', reviewed_by_admin_id = $1, reviewed_on = CURRENT_TIMESTAMP
       WHERE request_id = $2`,
      [req.admin.admin_id, req.params.id]
    );

    // Log action
    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'enrollment', $2, 'AUTHORIZE', $3)`,
      [req.admin.admin_id, request.student_id, `Approved course registration`]
    );

    res.json({ message: 'Course registration approved!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reject course registration
router.put('/:id/reject', auth, async (req, res) => {
  try {
    const { rejection_reason } = req.body;

    const result = await pool.query(
      `UPDATE course_registration_requests 
       SET status = 'rejected', reviewed_by_admin_id = $1, 
           reviewed_on = CURRENT_TIMESTAMP, rejection_reason = $2
       WHERE request_id = $3 AND status = 'pending'
       RETURNING *`,
      [req.admin.admin_id, rejection_reason || 'No reason provided', req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found or already processed' });
    }

    res.json({ message: 'Course registration rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;