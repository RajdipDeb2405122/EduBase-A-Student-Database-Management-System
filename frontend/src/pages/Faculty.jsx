import { useState, useEffect } from 'react'
import api from '../api'

const Faculty = () => {
  const [faculty, setFaculty] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    designation: 'Lecturer',
    department_id: '',
    phone: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [facultyRes, deptRes] = await Promise.all([
        api.get('/faculty'),
        api.get('/departments')
      ])
      setFaculty(facultyRes.data)
      setDepartments(deptRes.data)
    } catch (err) {
      console.error('Failed to load faculty:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/faculty', formData)
      setShowModal(false)
      setFormData({ full_name: '', email: '', designation: 'Lecturer', department_id: '', phone: '' })
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Faculty</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Faculty</button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Designation</th>
                <th>Department</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {faculty.map(f => (
                <tr key={f.faculty_id}>
                  <td>{f.full_name}</td>
                  <td>{f.email}</td>
                  <td>{f.designation}</td>
                  <td>{f.department_name}</td>
                  <td>{f.phone || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {faculty.length === 0 && <div className="empty-state">No faculty found</div>}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Faculty</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input type="text" className="form-input" value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})} required />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input type="email" className="form-input" value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input type="text" className="form-input" value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Designation *</label>
                  <select className="form-select" value={formData.designation}
                    onChange={(e) => setFormData({...formData, designation: e.target.value})}>
                    <option value="Professor">Professor</option>
                    <option value="Associate Professor">Associate Professor</option>
                    <option value="Assistant Professor">Assistant Professor</option>
                    <option value="Lecturer">Lecturer</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Department *</label>
                  <select className="form-select" value={formData.department_id}
                    onChange={(e) => setFormData({...formData, department_id: e.target.value})} required>
                    <option value="">Select Department</option>
                    {departments.map(d => (
                      <option key={d.department_id} value={d.department_id}>{d.department_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Faculty</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Faculty
