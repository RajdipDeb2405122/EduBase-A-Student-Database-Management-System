import { useState, useEffect } from 'react'
import api from '../api'

const CourseRegistrationRequests = () => {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')

  useEffect(() => {
    loadRequests()
  }, [filter])

  const loadRequests = async () => {
    try {
      const { data } = await api.get(`/course-registration?status=${filter}`)
      setRequests(data)
    } catch (err) {
      console.error('Failed to load:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (id) => {
    try {
      await api.put(`/course-registration/${id}/approve`)
      alert('Approved!')
      loadRequests()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleReject = async (id) => {
    const reason = prompt('Rejection reason:')
    if (reason === null) return
    try {
      await api.put(`/course-registration/${id}/reject`, { rejection_reason: reason })
      alert('Rejected')
      loadRequests()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Course Registration Requests</h1>
        <select className="form-select" style={{ width: '200px' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="pending">Pending ({requests.length})</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {filter === 'pending' && requests.length > 0 && (
        <div className="card" style={{ background: '#fef3c7', borderColor: '#f59e0b', marginBottom: '1.5rem' }}>
          <p style={{ color: '#92400e', fontWeight: '500' }}>
            📋 {requests.length} course registration request(s) waiting for approval
          </p>
        </div>
      )}

      <div className="card">
        {requests.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Reg No</th>
                  <th>Course</th>
                  <th>Credits</th>
                  <th>Year/Term</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.request_id}>
                    <td>{req.student_name}<br/><small>{req.student_email}</small></td>
                    <td>{req.registration_no}</td>
                    <td>{req.course_code}<br/><small>{req.course_title}</small></td>
                    <td>{req.credit_hours}</td>
                    <td>{req.academic_year}<br/>{req.term}</td>
                    <td>{new Date(req.requested_on).toLocaleDateString()}</td>
                    <td>
                      {filter === 'pending' ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-sm btn-primary" onClick={() => handleApprove(req.request_id)}>Approve</button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleReject(req.request_id)}>Reject</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          {req.rejection_reason || `By ${req.reviewed_by_name || 'Admin'}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No requests found</div>
        )}
      </div>
    </div>
  )
}

export default CourseRegistrationRequests