import { useState, useEffect } from 'react'
import api from '../api'

const Departments = () => {
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    department_name: '',
    office_location: '',
    phone: ''
  })

  useEffect(() => {
    loadDepartments()
  }, [])

  const loadDepartments = async () => {
    try {
      const { data } = await api.get('/departments')
      setDepartments(data)
    } catch (err) {
      console.error('Failed to load departments:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/departments', formData)
      setShowModal(false)
      setFormData({ department_name: '', office_location: '', phone: '' })
      loadDepartments()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Departments</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Department</button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Department Name</th>
                <th>Office Location</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {departments.map(d => (
                <tr key={d.department_id}>
                  <td>{d.department_name}</td>
                  <td>{d.office_location || 'N/A'}</td>
                  <td>{d.phone || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {departments.length === 0 && <div className="empty-state">No departments found</div>}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Department</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Department Name *</label>
                <input type="text" className="form-input" value={formData.department_name}
                  onChange={(e) => setFormData({...formData, department_name: e.target.value})} required />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Office Location</label>
                  <input type="text" className="form-input" value={formData.office_location}
                    onChange={(e) => setFormData({...formData, office_location: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input type="text" className="form-input" value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Department</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Departments
