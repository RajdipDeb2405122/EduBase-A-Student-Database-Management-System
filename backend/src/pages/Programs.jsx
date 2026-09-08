import { useState, useEffect } from 'react'
import api from '../api'

const Programs = () => {
  const [programs, setPrograms] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    program_name: '',
    degree_level: 'Bachelor',
    department_id: '',
    duration_years: 4,
    total_credits: '140.00'
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [progRes, deptRes] = await Promise.all([
        api.get('/programs'),
        api.get('/departments')
      ])
      setPrograms(progRes.data)
      setDepartments(deptRes.data)
    } catch (err) {
      console.error('Failed to load programs:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/programs', { ...formData, duration_years: parseInt(formData.duration_years), total_credits: parseFloat(formData.total_credits) })
      setShowModal(false)
      setFormData({ program_name: '', degree_level: 'Bachelor', department_id: '', duration_years: 4, total_credits: '140.00' })
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Programs</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Program</button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Program Name</th>
                <th>Degree Level</th>
                <th>Department</th>
                <th>Duration</th>
                <th>Total Credits</th>
              </tr>
            </thead>
            <tbody>
              {programs.map(p => (
                <tr key={p.program_id}>
                  <td>{p.program_name}</td>
                  <td>{p.degree_level}</td>
                  <td>{p.department_name}</td>
                  <td>{p.duration_years} years</td>
                  <td>{p.total_credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {programs.length === 0 && <div className="empty-state">No programs found</div>}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Program</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Program Name *</label>
                <input type="text" className="form-input" value={formData.program_name}
                  onChange={(e) => setFormData({...formData, program_name: e.target.value})} required />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Degree Level *</label>
                  <select className="form-select" value={formData.degree_level}
                    onChange={(e) => setFormData({...formData, degree_level: e.target.value})}>
                    <option value="Bachelor">Bachelor</option>
                    <option value="Master">Master</option>
                    <option value="PhD">PhD</option>
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

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Duration (Years)</label>
                  <input type="number" className="form-input" value={formData.duration_years}
                    onChange={(e) => setFormData({...formData, duration_years: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Total Credits</label>
                  <input type="number" step="0.5" className="form-input" value={formData.total_credits}
                    onChange={(e) => setFormData({...formData, total_credits: e.target.value})} />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Program</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Programs
