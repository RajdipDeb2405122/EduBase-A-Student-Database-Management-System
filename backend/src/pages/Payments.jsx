import { useState, useEffect } from 'react'
import api from '../api'

const Payments = () => {
  const [payments, setPayments] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    student_id: '',
    academic_year: '2024-2025',
    term: 'Fall',
    payment_type: 'Tuition Fee',
    amount: '',
    paid_on: new Date().toISOString().split('T')[0],
    status: 'paid'
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [paymentsRes, studentRes] = await Promise.all([
        api.get('/payments'),
        api.get('/students')
      ])
      setPayments(paymentsRes.data)
      setStudents(studentRes.data.filter(s => s.current_status === 'active'))
    } catch (err) {
      console.error('Failed to load payments:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/payments', { ...formData, amount: parseFloat(formData.amount) })
      setShowModal(false)
      setFormData({ student_id: '', academic_year: '2024-2025', term: 'Fall', payment_type: 'Tuition Fee', amount: '', paid_on: new Date().toISOString().split('T')[0], status: 'paid' })
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  const totalAmount = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + parseFloat(p.amount), 0)

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Payments</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Record Payment</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon green">💰</div>
          <div className="stat-value">৳{totalAmount.toLocaleString()}</div>
          <div className="stat-label">Total Collected</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">📋</div>
          <div className="stat-value">{payments.length}</div>
          <div className="stat-label">Total Transactions</div>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Year/Term</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.payment_id}>
                  <td>{p.full_name}</td>
                  <td>{p.payment_type}</td>
                  <td>৳{parseFloat(p.amount).toLocaleString()}</td>
                  <td>{p.academic_year} / {p.term}</td>
                  <td>{new Date(p.paid_on).toLocaleDateString()}</td>
                  <td><span className={`badge badge-${p.status === 'paid' ? 'success' : 'warning'}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {payments.length === 0 && <div className="empty-state">No payments found</div>}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Record Payment</h2>
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

              <div className="form-group">
                <label className="form-label">Payment Type *</label>
                <select className="form-select" value={formData.payment_type}
                  onChange={(e) => setFormData({...formData, payment_type: e.target.value})}>
                  <option value="Tuition Fee">Tuition Fee</option>
                  <option value="Admission Fee">Admission Fee</option>
                  <option value="Lab Fee">Lab Fee</option>
                  <option value="Library Fee">Library Fee</option>
                  <option value="Exam Fee">Exam Fee</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount *</label>
                  <input type="number" className="form-input" value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-input" value={formData.paid_on}
                    onChange={(e) => setFormData({...formData, paid_on: e.target.value})} required />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Academic Year</label>
                  <select className="form-select" value={formData.academic_year}
                    onChange={(e) => setFormData({...formData, academic_year: e.target.value})}>
                    <option value="2024-2025">2024-2025</option>
                    <option value="2023-2024">2023-2024</option>
                    <option value="2022-2023">2022-2023</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Term</label>
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
                <button type="submit" className="btn btn-primary">Save Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Payments
