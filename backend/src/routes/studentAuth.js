const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const router = express.Router();

// Student registration request
router.post('/register', async (req, res) => {
  try {
    const { registration_no, full_name, email, phone, date_of_birth, program_id, password } = req.body;

    // Validate registration number (7 digits: YY + DD + NNN)
    if (registration_no) {
      const regNo = registration_no.toString();
      if (!/^\d{7}$/.test(regNo)) {
        return res.status(400).json({ error: 'Registration number must be exactly 7 digits (YYXXXXX format)' });
      }
      const year = parseInt(regNo.substring(0, 2));
      if (year < 21 || year > 30) {
        return res.status(400).json({ error: 'Registration number must start with year (21-30)' });
      }
    }

    // Check if email already exists in requests
    const existingEmail = await pool.query(
      'SELECT request_id FROM student_registration_requests WHERE email = $1',
      [email]
    );
    if (existingEmail.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered or pending' });
    }

    // Check if registration_no already exists
    if (registration_no) {
      const existingReg = await pool.query(
        'SELECT request_id FROM student_registration_requests WHERE registration_no = $1',
        [registration_no]
      );
      const existingStudent = await pool.query(
        'SELECT student_id FROM student WHERE registration_no = $1',
        [registration_no]
      );
      if (existingReg.rows.length > 0 || existingStudent.rows.length > 0) {
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

// Student login - NOW WITH PASSWORD
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

    // Verify password
    if (!student.password_hash) {
      return res.status(401).json({ error: 'Password not set. Please contact administrator.' });
    }

    const isMatch = await bcrypt.compare(password, student.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

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
      SELECT s.*, p.program_name, p.degree_level, d.department_name, 
             f.full_name as advisor_name, f.email as advisor_email
      FROM student s
      LEFT JOIN program p ON s.program_id = p.program_id
      LEFT JOIN department d ON p.department_id = d.department_id
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

// Get student course registration requests
router.get('/me/:id/course-requests', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT crr.*, c.course_code, c.course_title, c.credit_hours,
             a.full_name as reviewed_by_name
      FROM course_registration_requests crr
      JOIN course c ON crr.course_id = c.course_id
      LEFT JOIN admin a ON crr.reviewed_by_admin_id = a.admin_id
      WHERE crr.student_id = $1
      ORDER BY crr.requested_on DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get available courses for student (by level/term)
router.get('/courses/:studentId', async (req, res) => {
  try {
    const { level, term } = req.query;
    
    // Get student's program and calculate level
    const studentResult = await pool.query(
      'SELECT program_id FROM student WHERE student_id = $1',
      [req.params.studentId]
    );
    
    let query = `
      SELECT c.*, p.program_name
      FROM course c
      LEFT JOIN program p ON c.program_id = p.program_id
      WHERE c.active = true
    `;
    const params = [];
    
    if (level) {
      query += ` AND c.term_no = $${params.length + 1}`;
      params.push(parseInt(level));
    }
    
    if (term) {
      query += ` AND (c.term_no = $${params.length + 1} OR c.term_no = $${params.length + 2})`;
      params.push(parseInt(term));
    }
    
    query += ' ORDER BY c.course_code';
    
    const result = await pool.query(query, params);
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