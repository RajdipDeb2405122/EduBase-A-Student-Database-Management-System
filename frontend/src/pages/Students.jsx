import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

const Students = () => {
  const [students, setStudents] = useState([])
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterProgram, setFilterProgram] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    registration_no: '',
    full_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    admission_date: '',
    program_id: '',
    advisor_id: '',
    current_status: 'active',
    current_cgpa: '0.00'
  })

  useEffect(() => {
    loadStudents()
    loadPrograms()
  }, [])

  const loadStudents = async () => {
    try {
      const { data } = await api.get('/students')
      setStudents(data)
    } catch (err) {
      console.error('Failed to load students:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadPrograms = async () => {
    try {
      const { data } = await api.get('/programs')
      setPrograms(data)
    } catch (err) {
      console.error('Failed to load programs:', err)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/students', formData)
      setShowModal(false)
      setFormData({
        registration_no: '',
        full_name: '',
        email: '',
        phone: '',
        date_of_birth: '',
        admission_date: '',
        program_id: '',
        advisor_id: '',
        current_status: 'active',
        current_cgpa: '0.00'
      })
      loadStudents()
    } catch (err) {
      alert(err.message)
    }
  }

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.full_name.toLowerCase().includes(search.toLowerCase()) ||
                         s.registration_no.toLowerCase().includes(search.toLowerCase())
    const matchesProgram = !filterProgram || s.program_id === parseInt(filterProgram)
    return matchesSearch && matchesProgram
  })

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Students</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Student</button>
      </div>

      <div className="card">
        <div className="form-row" style={{ marginBottom: '1.5rem' }}>
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search by name or reg no..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="form-select" value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)}>
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
                <th>Reg No</th>
                <th>Name</th>
                <th>Email</th>
                <th>Program</th>
                <th>Status</th>
                <th>CGPA</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(student => (
                <tr key={student.student_id}>
                  <td>{student.registration_no}</td>
                  <td>{student.full_name}</td>
                  <td>{student.email}</td>
                  <td>{student.program_name}</td>
                  <td>
                    <span className={`badge badge-${student.current_status === 'active' ? 'success' : 'danger'}`}>
                      {student.current_status}
                    </span>
                  </td>
                  <td>{parseFloat(student.current_cgpa).toFixed(2)}</td>
                  <td>
                    <Link to={`/students/${student.student_id}`} className="btn btn-sm btn-secondary">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredStudents.length === 0 && (
          <div className="empty-state">No students found</div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add New Student</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Registration No *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.registration_no}
                    onChange={(e) => setFormData({...formData, registration_no: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input
                    type="email"
                    className="form-input"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Admission Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.admission_date}
                    onChange={(e) => setFormData({...formData, admission_date: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Program *</label>
                <select
                  className="form-select"
                  value={formData.program_id}
                  onChange={(e) => setFormData({...formData, program_id: e.target.value})}
                  required
                >
                  <option value="">Select Program</option>
                  {programs.map(p => (
                    <option key={p.program_id} value={p.program_id}>{p.program_name}</option>
                  ))}
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Student</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Students
