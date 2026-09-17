import { useState, useEffect } from 'react'
import api from '../api'

const emptyForm = {
  course_code: '',
  course_title: '',
  program_id: '',
  faculty_id: '',
  credit_hours: '3.00',
  term_no: 1,
  course_type: 'Core',
  active: true
}

const Courses = () => {
  const [courses, setCourses] = useState([])
  const [programs, setPrograms] = useState([])
  const [faculty, setFaculty] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterProgram, setFilterProgram] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCourseId, setEditingCourseId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [coursesRes, programsRes, facultyRes] = await Promise.all([
        api.get('/courses'),
        api.get('/programs'),
        api.get('/faculty')
      ])
      setCourses(coursesRes.data)
      setPrograms(programsRes.data)
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
      program_id: course.program_id ?? '',
      faculty_id: course.faculty_id ?? '',
      credit_hours: course.credit_hours ?? '3.00',
      term_no: course.term_no ?? 1,
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
        program_id: formData.program_id ? parseInt(formData.program_id) : null,
        faculty_id: formData.faculty_id ? parseInt(formData.faculty_id) : null,
        credit_hours: parseFloat(formData.credit_hours),
        term_no: parseInt(formData.term_no)
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

  const filteredCourses = filterProgram
    ? courses.filter(c => c.program_id === parseInt(filterProgram))
    : courses

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Courses</h1>
        <button className="btn btn-primary" onClick={openAddModal}>+ Add Course</button>
      </div>

      <div className="card">
        <div style={{ marginBottom: '1.5rem' }}>
          <select className="form-select" style={{ maxWidth: '300px' }} value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)}>
            <option value="">All Programs</option>
            {programs.map(p => (
              <option key={p.program_id} value={p.program_id}>{p.program_name}</option>
            ))}
          </select>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Title</th>
                <th>Program</th>
                <th>Instructor</th>
                <th>Credits</th>
                <th>Term</th>
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
                  <td>{course.program_name}</td>
                  <td>{course.faculty_name || 'Not assigned'}</td>
                  <td>{course.credit_hours}</td>
                  <td>{course.term_no}</td>
                  <td>{course.course_type}</td>
                  <td>
                    <span className={`badge badge-${course.active ? 'success' : 'secondary'}`}>
                      {course.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(course)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(course)}>Delete</button>
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
                  <label className="form-label">Program *</label>
                  <select className="form-select" value={formData.program_id}
                    onChange={(e) => setFormData({...formData, program_id: e.target.value})} required>
                    <option value="">Select Program</option>
                    {programs.map(p => (
                      <option key={p.program_id} value={p.program_id}>{p.program_name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Instructor</label>
                  <select className="form-select" value={formData.faculty_id}
                    onChange={(e) => setFormData({...formData, faculty_id: e.target.value})}>
                    <option value="">Select Instructor</option>
                    {faculty.map(f => (
                      <option key={f.faculty_id} value={f.faculty_id}>{f.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Credit Hours</label>
                  <input type="number" step="0.5" className="form-input" value={formData.credit_hours}
                    onChange={(e) => setFormData({...formData, credit_hours: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Term No</label>
                  <input type="number" className="form-input" value={formData.term_no}
                    onChange={(e) => setFormData({...formData, term_no: e.target.value})} />
                </div>
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
              </div>

              <div className="form-row">
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
