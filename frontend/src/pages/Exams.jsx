import { useState, useEffect } from 'react'
import api from '../api'

const Exams = () => {
  const [exams, setExams] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    enrollment_id: '',
    exam_type: 'Midterm',
    exam_date: '',
    total_marks: '100',
    obtained_marks: '',
    remarks: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [examsRes, enrollRes] = await Promise.all([
        api.get('/exams'),
        api.get('/enrollments?status=enrolled')
      ])
      setExams(examsRes.data)
      setEnrollments(enrollRes.data)
    } catch (err) {
      console.error('Failed to load exams:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/exams', {
        ...formData,
        total_marks: parseFloat(formData.total_marks),
        obtained_marks: formData.obtained_marks ? parseFloat(formData.obtained_marks) : null
      })
      setShowModal(false)
      setFormData({ enrollment_id: '', exam_type: 'Midterm', exam_date: '', total_marks: '100', obtained_marks: '', remarks: '' })
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Exams</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Record Exam</button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Course</th>
                <th>Exam Type</th>
                <th>Date</th>
                <th>Marks</th>
                <th>Grade</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {exams.map(exam => (
                <tr key={exam.exam_id}>
                  <td>{exam.student_name}</td>
                  <td>{exam.course_code}</td>
                  <td>{exam.exam_type}</td>
                  <td>{exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : 'N/A'}</td>
                  <td>{exam.obtained_marks || '0'}/{exam.total_marks}</td>
                  <td><strong>{exam.grade || '-'}</strong></td>
                  <td>{exam.remarks || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {exams.length === 0 && <div className="empty-state">No exam records found</div>}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Record Exam Result</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Enrollment *</label>
                <select className="form-select" value={formData.enrollment_id}
                  onChange={(e) => setFormData({...formData, enrollment_id: e.target.value})} required>
                  <option value="">Select Enrollment</option>
                  {enrollments.map(e => (
                    <option key={e.enrollment_id} value={e.enrollment_id}>
                      {e.registration_no} - {e.student_name} | {e.course_code} ({e.academic_year})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Exam Type *</label>
                  <select className="form-select" value={formData.exam_type}
                    onChange={(e) => setFormData({...formData, exam_type: e.target.value})}>
                    <option value="Midterm">Midterm</option>
                    <option value="Final">Final</option>
                    <option value="Quiz">Quiz</option>
                    <option value="Assignment">Assignment</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Exam Date</label>
                  <input type="date" className="form-input" value={formData.exam_date}
                    onChange={(e) => setFormData({...formData, exam_date: e.target.value})} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Total Marks *</label>
                  <input type="number" className="form-input" value={formData.total_marks}
                    onChange={(e) => setFormData({...formData, total_marks: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Obtained Marks</label>
                  <input type="number" className="form-input" value={formData.obtained_marks}
                    onChange={(e) => setFormData({...formData, obtained_marks: e.target.value})} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Remarks</label>
                <input type="text" className="form-input" value={formData.remarks}
                  onChange={(e) => setFormData({...formData, remarks: e.target.value})} />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Result</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Exams
