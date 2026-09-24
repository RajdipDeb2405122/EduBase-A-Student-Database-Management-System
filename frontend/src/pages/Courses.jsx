import { useState, useEffect } from 'react'
import api from '../api'

const emptyForm = {
  course_code: '',
  course_title: '',
  department_id: '',
  faculty_id: '',
  credit_hours: '3.00',
  level: '1',
  term: '1',
  course_type: 'Core',
  active: true
}

const Courses = () => {
  const [courses, setCourses] = useState([])
  const [departments, setDepartments] = useState([])
  const [faculty, setFaculty] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ department_id: '', level: '', term: '' })
  const [showModal, setShowModal] = useState(false)
  const [editingCourseId, setEditingCourseId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [coursesRes, departmentsRes, facultyRes] = await Promise.all([
        api.get('/courses'),
        api.get('/departments'),
        api.get('/faculty')
      ])
      setCourses(coursesRes.data)
      setDepartments(departmentsRes.data)
      setFaculty(facultyRes.data)
    } catch (err) {
      console.error('Failed to load courses:', err)
    } finally {
      setLoading(false)
    }
  }

  const openAddModal = () => {
    setEditingCourseId(null)
    setFormData(emptyForm)
    setShowModal(true)
  }

  const openEditModal = (course) => {
    setEditingCourseId(course.course_id)
    setFormData({
      course_code: course.course_code || '',
      course_title: course.course_title || '',
      department_id: course.department_id ?? '',
      faculty_id: course.faculty_id ?? '',
      credit_hours: course.credit_hours ?? '3.00',
      level: String(course.level ?? 1),
      term: String(course.term ?? 1),
      course_type: course.course_type || 'Core',
      active: course.active !== false
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingCourseId(null)
    setFormData(emptyForm)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        ...formData,
        department_id: formData.department_id ? parseInt(formData.department_id) : null,
        faculty_id: formData.faculty_id ? parseInt(formData.faculty_id) : null,
        credit_hours: parseFloat(formData.credit_hours),
        level: parseInt(formData.level),
        term: parseInt(formData.term)
      }

      if (editingCourseId) {
        await api.put(`/courses/${editingCourseId}`, payload)
      } else {
        await api.post('/courses', payload)
      }

      closeModal()
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleDelete = async (course) => {
    if (!window.confirm(`Delete course ${course.course_code} - ${course.course_title}? This cannot be undone.`)) {
      return
    }
    try {
      await api.delete(`/courses/${course.course_id}`)
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  const filteredCourses = courses.filter(c =>
    (!filter.department_id || c.department_id === parseInt(filter.department_id)) &&
    (!filter.level || c.level === parseInt(filter.level)) &&
    (!filter.term || c.term === parseInt(filter.term))
  )

  // Instructors come from the course's own department.
  const departmentFaculty = faculty.filter(f =>
    !formData.department_id || f.department_id === parseInt(formData.department_id)
  )

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Courses</h1>
        <button className="btn btn-primary" onClick={openAddModal}>+ Add Course</button>
      </div>

      <div className="card">
        <div className="form-row" style={{ marginBottom: '1.5rem' }}>
          <select className="form-select" value={filter.department_id}
            onChange={(e) => setFilter({ ...filter, department_id: e.target.value })}>
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d.department_id} value={d.department_id}>{d.department_name}</option>
            ))}
          </select>
          <select className="form-select" value={filter.level}
            onChange={(e) => setFilter({ ...filter, level: e.target.value })}>
            <option value="">All Levels</option>
            {[1, 2, 3, 4].map(n => <option key={n} value={n}>Level {n}</option>)}
          </select>
          <select className="form-select" value={filter.term}
            onChange={(e) => setFilter({ ...filter, term: e.target.value })}>
            <option value="">All Terms</option>
            {[1, 2].map(n => <option key={n} value={n}>Term {n}</option>)}
          </select>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Title</th>
                <th>Department</th>
                <th>Level-Term</th>
                <th>Instructor</th>
                <th>Credits</th>
                <th>Type</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCourses.map(course => (
                <tr key={course.course_id}>
                  <td>{course.course_code}</td>
                  <td>{course.course_title}</td>
                  <td>{course.department_code || course.department_name}</td>
                  <td>{course.level}-{course.term}</td>
                  <td>{course.faculty_name || 'Not assigned'}</td>
                  <td>{course.credit_hours}</td>
                  <td>{course.course_type}</td>
                  <td>
                    <span className={`badge badge-${course.active ? 'success' : 'secondary'}`}>
                      {course.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(course)}>Edit</button>
                      <button className="btn btn-danger btn-sm" disabled={course.enrollment_count > 0}
                        title={course.enrollment_count > 0 ? 'Has enrollments — mark inactive instead' : undefined}
                        onClick={() => handleDelete(course)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredCourses.length === 0 && <div className="empty-state">No courses found</div>}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingCourseId ? 'Edit Course' : 'Add New Course'}</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Course Code *</label>
                  <input type="text" className="form-input" value={formData.course_code}
                    placeholder="CSE 101" pattern="[A-Za-z]{2,5} [0-9]{3}"
                    title='Letters, a space, then 3 digits — e.g. "CSE 101"'
                    onChange={(e) => setFormData({...formData, course_code: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Course Title *</label>
                  <input type="text" className="form-input" value={formData.course_title}
                    onChange={(e) => setFormData({...formData, course_title: e.target.value})} required />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Department *</label>
                  <select className="form-select" value={formData.department_id}
                    onChange={(e) => setFormData({...formData, department_id: e.target.value, faculty_id: ''})} required>
                    <option value="">Select Department</option>
                    {departments.map(d => (
                      <option key={d.department_id} value={d.department_id}>{d.department_name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Instructor</label>
                  <select className="form-select" value={formData.faculty_id}
                    onChange={(e) => setFormData({...formData, faculty_id: e.target.value})}>
                    <option value="">Select Instructor</option>
                    {departmentFaculty.map(f => (
                      <option key={f.faculty_id} value={f.faculty_id}>{f.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Level *</label>
                  <select className="form-select" value={formData.level}
                    onChange={(e) => setFormData({...formData, level: e.target.value})}>
                    {[1, 2, 3, 4].map(n => <option key={n} value={n}>Level {n}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Term *</label>
                  <select className="form-select" value={formData.term}
                    onChange={(e) => setFormData({...formData, term: e.target.value})}>
                    {[1, 2].map(n => <option key={n} value={n}>Term {n}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Credit Hours *</label>
                  <input type="number" step="0.25" min="0.25" max="12" className="form-input" value={formData.credit_hours}
                    onChange={(e) => setFormData({...formData, credit_hours: e.target.value})} required />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Course Type</label>
                  <select className="form-select" value={formData.course_type}
                    onChange={(e) => setFormData({...formData, course_type: e.target.value})}>
                    <option value="Core">Core</option>
                    <option value="Elective">Elective</option>
                    <option value="Project">Project</option>
                    <option value="Lab">Lab</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={formData.active ? 'true' : 'false'}
                    onChange={(e) => setFormData({...formData, active: e.target.value === 'true'})}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingCourseId ? 'Save Changes' : 'Add Course'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Courses
