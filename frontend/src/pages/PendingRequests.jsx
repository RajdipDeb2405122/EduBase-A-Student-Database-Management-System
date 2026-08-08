import { useState, useEffect } from 'react'
import api from '../api'

const PendingRequests = () => {
  const [requests, setRequests] = useState([])
  const [faculty, setFaculty] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')

  useEffect(() => {
    loadData()
  }, [filter])

  const loadData = async () => {
    try {
      const [reqRes, facRes] = await Promise.all([
        api.get(`/student-registration?status=${filter}`),
        api.get('/faculty')
      ])
      setRequests(reqRes.data)
      setFaculty(facRes.data)
    } catch (err) {
      console.error('Failed to load requests:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (id) => {
    const advisorSelect = document.getElementById(`advisor-${id}`)
    const advisorId = advisorSelect?.value
    
    if (!advisorId) {
      alert('Please select an advisor before approving')
      return
    }
    
    try {
      await api.put(`/student-registration/${id}/approve`, { advisor_id: parseInt(advisorId) })
      alert('Registration approved!')
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleReject = async (id) => {
    const reason = prompt('Enter rejection reason:')
    if (reason === null) return
    try {
      await api.put(`/student-registration/${id}/reject`, { rejection_reason: reason || 'No reason provided' })
      alert('Registration rejected')
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="spinner"></div>

  const pendingCount = requests.length

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Registration Requests</h1>
        <select className="form-select" style={{ width: '200px' }} 
          value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="pending">Pending ({pendingCount})</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {filter === 'pending' && pendingCount > 0 && (
        <div className="card" style={{ background: '#fef3c7', borderColor: '#f59e0b', marginBottom: '1.5rem' }}>
          <p style={{ color: '#92400e', fontWeight: '500' }}>
            📋 {pendingCount} pending request(s) waiting for your approval
          </p>
        </div>
      )}

      <div className="card">
        {requests.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Program</th>
                  <th>Reg No</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.request_id}>
                    <td>{req.full_name}</td>
                    <td>{req.email}</td>
                    <td>{req.phone || 'N/A'}</td>
                    <td>{req.program_name || 'N/A'}</td>
                    <td>{req.registration_no || '-'}</td>
                    <td>{new Date(req.requested_on).toLocaleDateString()}</td>
                    <td>
                      {filter === 'pending' ? (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <select 
                            id={`advisor-${req.request_id}`}
                            className="form-select" 
                            style={{ width: '150px', padding: '0.375rem' }}>
                            <option value="">Select Advisor</option>
                            {faculty.map(f => (
                              <option key={f.faculty_id} value={f.faculty_id}>
                                {f.full_name}
                              </option>
                            ))}
                          </select>
                          <button className="btn btn-sm btn-primary" onClick={() => handleApprove(req.request_id)}>
                            Approve
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleReject(req.request_id)}>
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {req.rejection_reason || `By ${req.reviewed_by_name}`}
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

export default PendingRequests