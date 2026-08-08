const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const router = express.Router();

// Student registration request
router.post('/register', async (req, res) => {
  try {
    const { registration_no, full_name, email, phone, date_of_birth, program_id, password } = req.body;

    // Check if email already exists
    const existingEmail = await pool.query(
      'SELECT request_id FROM student_registration_requests WHERE email = $1',
      [email]
    );
    if (existingEmail.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered or pending' });
    }

    // Check if registration_no exists
    if (registration_no) {
      const existingReg = await pool.query(
        'SELECT request_id FROM student_registration_requests WHERE registration_no = $1',
        [registration_no]
      );
      if (existingReg.rows.length > 0) {
        return res.status(400).json({ error: 'Registration number already registered or pending' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert request
    const result = await pool.query(
      `INSERT INTO student_registration_requests 
       (registration_no, full_name, email, phone, date_of_birth, program_id, password_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING request_id`,
      [registration_no || null, full_name, email, phone, date_of_birth, program_id, hashedPassword]
    );

    res.status(201).json({
      message: 'Registration request submitted successfully! Please wait for admin approval.',
      request_id: result.rows[0].request_id
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Student login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find student by email
    const studentResult = await pool.query(
      'SELECT * FROM student WHERE email = $1',
      [email]
    );

    if (studentResult.rows.length === 0) {
      return res.status(401).json({ error: 'Student not found. Please register first.' });
    }

    const student = studentResult.rows[0];

    res.json({
      student_id: student.student_id,
      registration_no: student.registration_no,
      full_name: student.full_name,
      email: student.email,
      program_id: student.program_id
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get student profile
router.get('/me/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.program_name, p.degree_level, f.full_name as advisor_name
      FROM student s
      LEFT JOIN program p ON s.program_id = p.program_id
      LEFT JOIN faculty f ON s.advisor_id = f.faculty_id
      WHERE s.student_id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get student enrollments
router.get('/me/:id/enrollments', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*, c.course_code, c.course_title, c.credit_hours
      FROM enrollment e
      JOIN course c ON e.course_id = c.course_id
      WHERE e.student_id = $1
      ORDER BY e.academic_year DESC, e.term
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get student exams
router.get('/me/:id/exams', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ex.*, c.course_code, c.course_title, e.academic_year, e.term
      FROM exam ex
      JOIN enrollment e ON ex.enrollment_id = e.enrollment_id
      JOIN course c ON e.course_id = c.course_id
      WHERE e.student_id = $1
      ORDER BY ex.exam_date DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get student payments
router.get('/me/:id/payments', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM payment WHERE student_id = $1 ORDER BY paid_on DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get student scholarships
router.get('/me/:id/scholarships', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM scholarship WHERE student_id = $1 ORDER BY awarded_on DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;