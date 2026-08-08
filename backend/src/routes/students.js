const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all students
router.get('/', async (req, res) => {
  try {
    const { search, status, program_id } = req.query;
    let query = `
      SELECT s.*, p.program_name, p.degree_level, f.full_name as advisor_name,
             a.full_name as verified_by_name
      FROM student s
      LEFT JOIN program p ON s.program_id = p.program_id
      LEFT JOIN faculty f ON s.advisor_id = f.faculty_id
      LEFT JOIN admin a ON s.verified_by_admin_id = a.admin_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (s.full_name ILIKE $${paramIndex} OR s.registration_no ILIKE $${paramIndex} OR s.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (status) {
      query += ` AND s.current_status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    if (program_id) {
      query += ` AND s.program_id = $${paramIndex}`;
      params.push(program_id);
      paramIndex++;
    }

    query += ' ORDER BY s.registration_no';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get student by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.program_name, p.degree_level, f.full_name as advisor_name,
             a.full_name as verified_by_name
      FROM student s
      LEFT JOIN program p ON s.program_id = p.program_id
      LEFT JOIN faculty f ON s.advisor_id = f.faculty_id
      LEFT JOIN admin a ON s.verified_by_admin_id = a.admin_id
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

// Get student by registration number
router.get('/reg/:regNo', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.program_name, f.full_name as advisor_name
      FROM student s
      LEFT JOIN program p ON s.program_id = p.program_id
      LEFT JOIN faculty f ON s.advisor_id = f.faculty_id
      WHERE s.registration_no = $1
    `, [req.params.regNo]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get student enrollments
router.get('/:id/enrollments', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*, c.course_code, c.course_title, c.credit_hours,
             a.full_name as authorized_by_name
      FROM enrollment e
      JOIN course c ON e.course_id = c.course_id
      LEFT JOIN admin a ON e.authorized_by_admin_id = a.admin_id
      WHERE e.student_id = $1
      ORDER BY e.academic_year, e.term
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get student payments
router.get('/:id/payments', async (req, res) => {
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
router.get('/:id/scholarships', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM scholarship WHERE student_id = $1 ORDER BY awarded_on DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create student
router.post('/', auth, async (req, res) => {
  try {
    const { program_id, advisor_id, registration_no, full_name, email, phone, 
            date_of_birth, admission_date, current_status, current_cgpa } = req.body;
    
    const result = await pool.query(
      `INSERT INTO student (program_id, advisor_id, verified_by_admin_id, registration_no, 
        full_name, email, phone, date_of_birth, admission_date, current_status, current_cgpa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [program_id, advisor_id, req.admin.admin_id, registration_no, full_name, email, 
       phone, date_of_birth, admission_date, current_status || 'active', current_cgpa || 0]
    );

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'student', $2, 'CREATE', $3)`,
      [req.admin.admin_id, result.rows[0].student_id, `Admitted student: ${full_name} (${registration_no})`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update student
router.put('/:id', auth, async (req, res) => {
  try {
    const { program_id, advisor_id, registration_no, full_name, email, phone,
            date_of_birth, admission_date, current_status, current_cgpa } = req.body;

    const result = await pool.query(
      `UPDATE student SET program_id = $1, advisor_id = $2, registration_no = $3,
       full_name = $4, email = $5, phone = $6, date_of_birth = $7, 
       admission_date = $8, current_status = $9, current_cgpa = $10
       WHERE student_id = $11 RETURNING *`,
      [program_id, advisor_id, registration_no, full_name, email, phone,
       date_of_birth, admission_date, current_status, current_cgpa, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'student', $2, 'UPDATE', $3)`,
      [req.admin.admin_id, req.params.id, `Updated student: ${full_name}`]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete student
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM student WHERE student_id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, old_value)
       VALUES ($1, 'student', $2, 'DELETE', $3)`,
      [req.admin.admin_id, req.params.id, `Deleted student: ${result.rows[0].full_name}`]
    );

    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
