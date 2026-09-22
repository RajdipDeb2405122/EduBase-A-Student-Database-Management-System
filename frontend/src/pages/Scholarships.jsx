import { useState, useEffect } from 'react'
import api from '../api'
import useLiveUpdates from '../hooks/useLiveUpdates'

const Scholarships = () => {
  const [scholarships, setScholarships] = useState([])
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadData = async () => {
    try {
      const [schRes, appRes] = await Promise.all([
        api.get('/scholarships'),
        api.get('/scholarships/applications')
      ])

      setScholarships(schRes.data)
      setApplications(appRes.data)
      setError('')
    } catch (err) {
      console.error('Failed to load scholarships:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useLiveUpdates(loadData)

  // Admin can only Accept or Reject an application.
  // Accepting awards the fixed predefined scholarship.
  const review = async (application, action) => {
    setBusy(application.application_id)
    setError('')
    setMessage('')

    try {
      await api.put(
        `/scholarships/applications/${application.application_id}/${action}`
      )

      setMessage(
        action === 'approve'
          ? 'Application accepted — the scholarship has been awarded to the student.'
          : 'Application rejected.'
      )

      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const statusTone = status =>
    status === 'approved'
      ? 'success'
      : status === 'rejected'
        ? 'danger'
        : 'warning'

  const totalAmount = scholarships
    .filter(s => s.status === 'active')
    .reduce((sum, s) => sum + parseFloat(s.amount), 0)

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Scholarships</h1>
      </div>

      {error && (
        <p className="badge badge-danger" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="badge badge-success" role="status">
          {message}
        </p>
      )}

      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon orange">🎓</div>
          <div className="stat-value">৳{totalAmount.toLocaleString()}</div>
          <div className="stat-label">Total Active Scholarships</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">📋</div>
          <div className="stat-value">
            {scholarships.filter(s => s.status === 'active').length}
          </div>
          <div className="stat-label">Active Recipients</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">⏳</div>
          <div className="stat-value">
            {applications.filter(a => a.status === 'pending').length}
          </div>
          <div className="stat-label">Pending Applications</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Scholarship Applications</h2>

        <p>
          Students apply from the fixed list of 10 scholarships.
          Accept or reject each application — the award is created
          automatically when you accept.
        </p>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Scholarship</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Applied</th>
                <th>Status</th>
                <th>Review</th>
              </tr>
            </thead>

            <tbody>
              {applications.map(application => (
                <tr key={application.application_id}>
                  <td>
                    {application.student_name}
                    <br />
                    <small>{application.registration_no}</small>
                  </td>

                  <td>{application.scholarship_name}</td>
                  <td>{application.award_type || '-'}</td>

                  <td>
                    ৳{parseFloat(application.amount).toLocaleString()}
                  </td>

                  <td>
                    {new Date(application.applied_on).toLocaleDateString()}
                  </td>

                  <td>
                    <span className={`badge badge-${statusTone(application.status)}`}>
                      {application.status}
                    </span>
                  </td>

                  <td>
                    {application.status === 'pending' ? (
                      <>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy !== null}
                          onClick={() => review(application, 'approve')}
                        >
                          Accept
                        </button>
                        {' '}

                        <button
                          className="btn btn-sm btn-danger"
                          disabled={busy !== null}
                          onClick={() => review(application, 'reject')}
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <small>
                        {application.status === 'approved'
                          ? 'Accepted'
                          : 'Rejected'}
                        {application.reviewed_by_name
                          ? ` by ${application.reviewed_by_name}`
                          : ''}
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!applications.length && (
          <div className="empty-state">No scholarship applications yet</div>
        )}
      </div>

      <div className="card">
        <h2>Awarded Scholarships</h2>

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
                  <td>
                    {s.valid_until
                      ? new Date(s.valid_until).toLocaleDateString()
                      : 'N/A'}
                  </td>

                  <td>
                    <span className={`badge badge-${s.status === 'active' ? 'success' : 'secondary'}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {scholarships.length === 0 && (
          <div className="empty-state">No scholarships awarded</div>
        )}
      </div>
    </div>
  )
}

export default Scholarships