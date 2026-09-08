import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

const Dashboard = () => {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      const { data } = await api.get('/dashboard/stats')
      setStats(data)
    } catch (err) {
      console.error('Failed to load dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="spinner"></div>
  }

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">👥</div>
          <div className="stat-value">{stats?.students || 0}</div>
          <div className="stat-label">Active Students</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">👨‍🏫</div>
          <div className="stat-value">{stats?.faculty || 0}</div>
          <div className="stat-label">Faculty Members</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">📚</div>
          <div className="stat-value">{stats?.courses || 0}</div>
          <div className="stat-label">Active Courses</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">✅</div>
          <div className="stat-value">{stats?.enrollments || 0}</div>
          <div className="stat-label">Enrollments</div>
        </div>
      </div>

      <div className="form-row">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Admissions</h3>
            <Link to="/students" className="btn btn-sm btn-secondary">View All</Link>
          </div>
          {stats?.recentAdmissions?.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Reg No</th>
                    <th>Name</th>
                    <th>Program</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentAdmissions.map(student => (
                    <tr key={student.student_id}>
                      <td>{student.registration_no}</td>
                      <td>{student.full_name}</td>
                      <td>{student.program_name}</td>
                      <td>{new Date(student.admission_date).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No recent admissions</p>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Payments</h3>
            <Link to="/payments" className="btn btn-sm btn-secondary">View All</Link>
          </div>
          {stats?.recentPayments?.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentPayments.map(payment => (
                    <tr key={payment.payment_id}>
                      <td>{payment.full_name}</td>
                      <td>{payment.payment_type}</td>
                      <td>৳{parseFloat(payment.amount).toLocaleString()}</td>
                      <td>{new Date(payment.paid_on).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No recent payments</p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Financial Summary</h3>
        </div>
        <div className="stats-grid">
          <div>
            <div className="stat-label">Total Payments Collected</div>
            <div className="stat-value" style={{ color: '#10b981' }}>
              ৳{stats?.totalPayments?.toLocaleString() || 0}
            </div>
          </div>
          <div>
            <div className="stat-label">Total Scholarships Awarded</div>
            <div className="stat-value" style={{ color: '#f59e0b' }}>
              ৳{stats?.totalScholarships?.toLocaleString() || 0}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
