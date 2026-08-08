const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all exams
router.get('/', async (req, res) => {
  try {
    const { enrollment_id, exam_type } = req.query;
    let query = `
      SELECT ex.*, e.student_id, e.course_id, e.academic_year, e.term,
             s.registration_no, s.full_name as student_name,
             c.course_code, c.course_title
      FROM exam ex
      JOIN enrollment e ON ex.enrollment_id = e.enrollment_id
      JOIN student s ON e.student_id = s.student_id
      JOIN course c ON e.course_id = c.course_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (enrollment_id) {
      query += ` AND ex.enrollment_id = $${paramIndex}`;
      params.push(enrollment_id);
      paramIndex++;
    }
    if (exam_type) {
      query += ` AND ex.exam_type = $${paramIndex}`;
      params.push(exam_type);
      paramIndex++;
    }

    query += ' ORDER BY ex.exam_date DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get exam by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ex.*, e.student_id, e.course_id, e.academic_year, e.term,
             s.registration_no, s.full_name as student_name,
             c.course_code, c.course_title
      FROM exam ex
      JOIN enrollment e ON ex.enrollment_id = e.enrollment_id
      JOIN student s ON e.student_id = s.student_id
      JOIN course c ON e.course_id = c.course_id
      WHERE ex.exam_id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create exam record
router.post('/', auth, async (req, res) => {
  try {
    const { enrollment_id, exam_type, exam_date, total_marks, obtained_marks, grade, remarks } = req.body;

    // Calculate grade if not provided
    let calculatedGrade = grade;
    if (!grade && obtained_marks && total_marks) {
      const percentage = (obtained_marks / total_marks) * 100;
      if (percentage >= 90) calculatedGrade = 'A+';
      else if (percentage >= 85) calculatedGrade = 'A';
      else if (percentage >= 80) calculatedGrade = 'A-';
      else if (percentage >= 75) calculatedGrade = 'B+';
      else if (percentage >= 70) calculatedGrade = 'B';
      else if (percentage >= 65) calculatedGrade = 'B-';
      else if (percentage >= 60) calculatedGrade = 'C+';
      else if (percentage >= 55) calculatedGrade = 'C';
      else if (percentage >= 50) calculatedGrade = 'C-';
      else if (percentage >= 40) calculatedGrade = 'D';
      else calculatedGrade = 'F';
    }

    const result = await pool.query(
      `INSERT INTO exam (enrollment_id, exam_type, exam_date, total_marks, obtained_marks, grade, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [enrollment_id, exam_type, exam_date, total_marks, obtained_marks, calculatedGrade, remarks]
    );

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'exam', $2, 'CREATE', $3)`,
      [req.admin.admin_id, result.rows[0].exam_id, `Recorded ${exam_type} exam`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update exam
router.put('/:id', auth, async (req, res) => {
  try {
    const { exam_type, exam_date, total_marks, obtained_marks, grade, remarks } = req.body;

    // Calculate grade if not provided
    let calculatedGrade = grade;
    if (!grade && obtained_marks && total_marks) {
      const percentage = (obtained_marks / total_marks) * 100;
      if (percentage >= 90) calculatedGrade = 'A+';
      else if (percentage >= 85) calculatedGrade = 'A';
      else if (percentage >= 80) calculatedGrade = 'A-';
      else if (percentage >= 75) calculatedGrade = 'B+';
      else if (percentage >= 70) calculatedGrade = 'B';
      else if (percentage >= 65) calculatedGrade = 'B-';
      else if (percentage >= 60) calculatedGrade = 'C+';
      else if (percentage >= 55) calculatedGrade = 'C';
      else if (percentage >= 50) calculatedGrade = 'C-';
      else if (percentage >= 40) calculatedGrade = 'D';
      else calculatedGrade = 'F';
    }

    const result = await pool.query(
      `UPDATE exam SET exam_type = $1, exam_date = $2, total_marks = $3,
       obtained_marks = $4, grade = $5, remarks = $6
       WHERE exam_id = $7 RETURNING *`,
      [exam_type, exam_date, total_marks, obtained_marks, calculatedGrade, remarks, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, new_value)
       VALUES ($1, 'exam', $2, 'UPDATE', $3)`,
      [req.admin.admin_id, req.params.id, `Updated exam marks`]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete exam
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM exam WHERE exam_id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    await pool.query(
      `INSERT INTO admin_action_log (admin_id, target_table, target_id, action_type, old_value)
       VALUES ($1, 'exam', $2, 'DELETE', $3)`,
      [req.admin.admin_id, req.params.id, 'Deleted exam record']
    );

    res.json({ message: 'Exam deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
