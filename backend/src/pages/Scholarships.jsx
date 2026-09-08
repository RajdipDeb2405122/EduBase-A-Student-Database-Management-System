import { useState, useEffect } from 'react'
import api from '../api'

const Scholarships = () => {
  const [scholarships, setScholarships] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    student_id: '',
    scholarship_name: '',
    award_type: 'Academic Excellence',
    amount: '',
    awarded_on: new Date().toISOString().split('T')[0],
    valid_until: '',
    status: 'active'
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [schRes, studentRes] = await Promise.all([
        api.get('/scholarships'),
        api.get('/students')
      ])
      setScholarships(schRes.data)
      setStudents(studentRes.data.filter(s => s.current_status === 'active'))
    } catch (err) {
      console.error('Failed to load scholarships:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/scholarships', { ...formData, amount: parseFloat(formData.amount) })
      setShowModal(false)
      setFormData({ student_id: '', scholarship_name: '', award_type: 'Academic Excellence', amount: '', awarded_on: new Date().toISOString().split('T')[0], valid_until: '', status: 'active' })
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  const totalAmount = scholarships.filter(s => s.status === 'active').reduce((sum, s) => sum + parseFloat(s.amount), 0)

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Scholarships</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Award Scholarship</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon orange">🎓</div>
          <div className="stat-value">৳{totalAmount.toLocaleString()}</div>
          <div className="stat-label">Total Active Scholarships</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">📋</div>
          <div className="stat-value">{scholarships.filter(s => s.status === 'active').length}</div>
          <div className="stat-label">Active Recipients</div>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Scholarship</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Awarded</th>
                <th>Valid Until</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {scholarships.map(s => (
                <tr key={s.scholarship_id}>
                  <td>{s.student_name}</td>
                  <td>{s.scholarship_name}</td>
                  <td>{s.award_type}</td>
                  <td>৳{parseFloat(s.amount).toLocaleString()}</td>
                  <td>{new Date(s.awarded_on).toLocaleDateString()}</td>
                  <td>{s.valid_until ? new Date(s.valid_until).toLocaleDateString() : 'N/A'}</td>
                  <td><span className={`badge badge-${s.status === 'active' ? 'success' : 'secondary'}`}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {scholarships.length === 0 && <div className="empty-state">No scholarships found</div>}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Award Scholarship</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Student *</label>
                <select className="form-select" value={formData.student_id}
                  onChange={(e) => setFormData({...formData, student_id: e.target.value})} required>
                  <option value="">Select Student</option>
                  {students.map(s => (
                    <option key={s.student_id} value={s.student_id}>{s.registration_no} - {s.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Scholarship Name *</label>
                  <input type="text" className="form-input" value={formData.scholarship_name}
                    onChange={(e) => setFormData({...formData, scholarship_name: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Award Type</label>
                  <select className="form-select" value={formData.award_type}
                    onChange={(e) => setFormData({...formData, award_type: e.target.value})}>
                    <option value="Academic Excellence">Academic Excellence</option>
                    <option value="Sports">Sports</option>
                    <option value="Arts">Arts</option>
                    <option value="Financial Aid">Financial Aid</option>
                    <option value="Research">Research</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount *</label>
                  <input type="number" className="form-input" value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Award Date *</label>
                  <input type="date" className="form-input" value={formData.awarded_on}
                    onChange={(e) => setFormData({...formData, awarded_on: e.target.value})} required />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Valid Until</label>
                <input type="date" className="form-input" value={formData.valid_until}
                  onChange={(e) => setFormData({...formData, valid_until: e.target.value})} />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Award</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Scholarships
