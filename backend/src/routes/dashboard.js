const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const [
      studentCount,
      facultyCount,
      courseCount,
      enrollmentCount,
      paymentTotal,
      scholarshipTotal,
      recentAdmissions,
      recentPayments
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM student WHERE current_status = $1', ['active']),
      pool.query('SELECT COUNT(*) FROM faculty'),
      pool.query('SELECT COUNT(*) FROM course WHERE active = true'),
      pool.query('SELECT COUNT(*) FROM enrollment WHERE status = $1', ['enrolled']),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM payment WHERE status = 'paid'"),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM scholarship WHERE status = 'active'"),
      pool.query(`
        SELECT s.student_id, s.registration_no, s.full_name, p.program_name, s.admission_date
        FROM student s
        JOIN program p ON s.program_id = p.program_id
        ORDER BY s.admission_date DESC LIMIT 5
      `),
      pool.query(`
        SELECT pay.*, s.registration_no, s.full_name as student_name
        FROM payment pay
        JOIN student s ON pay.student_id = s.student_id
        WHERE pay.status = 'paid'
        ORDER BY pay.paid_on DESC LIMIT 5
      `)
    ]);

    res.json({
      students: parseInt(studentCount.rows[0].count),
      faculty: parseInt(facultyCount.rows[0].count),
      courses: parseInt(courseCount.rows[0].count),
      enrollments: parseInt(enrollmentCount.rows[0].count),
      totalPayments: parseFloat(paymentTotal.rows[0].total),
      totalScholarships: parseFloat(scholarshipTotal.rows[0].total),
      recentAdmissions: recentAdmissions.rows,
      recentPayments: recentPayments.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get students by program (for charts)
router.get('/students-by-program', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.program_name, COUNT(s.student_id) as count
      FROM program p
      LEFT JOIN student s ON p.program_id = s.program_id AND s.current_status = 'active'
      GROUP BY p.program_id, p.program_name
      ORDER BY count DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get enrollment trends
router.get('/enrollment-trends', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT academic_year, term, COUNT(*) as count
      FROM enrollment
      GROUP BY academic_year, term
      ORDER BY academic_year DESC, term
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get CGPA distribution
router.get('/cgpa-distribution', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        CASE 
          WHEN current_cgpa >= 3.75 THEN 'A+ / A'
          WHEN current_cgpa >= 3.50 THEN 'A-'
          WHEN current_cgpa >= 3.25 THEN 'B+'
          WHEN current_cgpa >= 3.00 THEN 'B'
          WHEN current_cgpa >= 2.75 THEN 'B-'
          WHEN current_cgpa >= 2.50 THEN 'C+'
          WHEN current_cgpa >= 2.00 THEN 'C'
          WHEN current_cgpa >= 1.50 THEN 'D'
          ELSE 'F'
        END as grade_range,
        COUNT(*) as count
      FROM student
      WHERE current_status = 'active'
      GROUP BY grade_range
      ORDER BY count DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get department statistics
router.get('/departments', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, 
             COUNT(DISTINCT f.faculty_id) as faculty_count,
             COUNT(DISTINCT p.program_id) as program_count,
             COUNT(DISTINCT s.student_id) as student_count
      FROM department d
      LEFT JOIN faculty f ON d.department_id = f.department_id
      LEFT JOIN program p ON d.department_id = p.department_id
      LEFT JOIN student s ON p.program_id = s.program_id AND s.current_status = 'active'
      GROUP BY d.department_id
      ORDER BY d.department_name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
