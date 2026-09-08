import { useState, useEffect } from 'react'
import api from '../api'

const Enrollments = () => {
  const [enrollments, setEnrollments] = useState([])
  const [students, setStudents] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    student_id: '',
    course_id: '',
    academic_year: '2024-2025',
    term: 'Fall'
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [enrollRes, studentRes, courseRes] = await Promise.all([
        api.get('/enrollments'),
        api.get('/students'),
        api.get('/courses?active=true')
      ])
      setEnrollments(enrollRes.data)
      setStudents(studentRes.data.filter(s => s.current_status === 'active'))
      setCourses(courseRes.data)
    } catch (err) {
      console.error('Failed to load enrollments:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/enrollments', formData)
      setShowModal(false)
      setFormData({ student_id: '', course_id: '', academic_year: '2024-2025', term: 'Fall' })
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Enrollments</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Enrollment</button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Reg No</th>
                <th>Course</th>
                <th>Academic Year</th>
                <th>Term</th>
                <th>Status</th>
                <th>Authorized By</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map(e => (
                <tr key={e.enrollment_id}>
                  <td>{e.student_name}</td>
                  <td>{e.registration_no}</td>
                  <td>{e.course_code} - {e.course_title}</td>
                  <td>{e.academic_year}</td>
                  <td>{e.term}</td>
                  <td>
                    <span className={`badge badge-${e.status === 'enrolled' ? 'success' : e.status === 'dropped' ? 'danger' : 'warning'}`}>
                      {e.status}
                    </span>
                  </td>
                  <td>{e.authorized_by_name || 'System'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {enrollments.length === 0 && <div className="empty-state">No enrollments found</div>}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">New Enrollment</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Student *</label>
                <select className="form-select" value={formData.student_id}
                  onChange={(e) => setFormData({...formData, student_id: e.target.value})} required>
                  <option value="">Select Student</option>
                  {students.map(s => (
                    <option key={s.student_id} value={s.student_id}>
                      {s.registration_no} - {s.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Course *</label>
                <select className="form-select" value={formData.course_id}
                  onChange={(e) => setFormData({...formData, course_id: e.target.value})} required>
                  <option value="">Select Course</option>
                  {courses.map(c => (
                    <option key={c.course_id} value={c.course_id}>
                      {c.course_code} - {c.course_title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Academic Year *</label>
                  <select className="form-select" value={formData.academic_year}
                    onChange={(e) => setFormData({...formData, academic_year: e.target.value})}>
                    <option value="2024-2025">2024-2025</option>
                    <option value="2023-2024">2023-2024</option>
                    <option value="2022-2023">2022-2023</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Term *</label>
                  <select className="form-select" value={formData.term}
                    onChange={(e) => setFormData({...formData, term: e.target.value})}>
                    <option value="Fall">Fall</option>
                    <option value="Spring">Spring</option>
                    <option value="Summer">Summer</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Enroll</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Enrollments
