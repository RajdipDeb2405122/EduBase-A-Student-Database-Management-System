import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStudentAuth } from '../context/StudentAuthContext'
import api from '../api'

const StudentDashboard = () => {
  const { student, logout } = useStudentAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [payments, setPayments] = useState([])
  const [exams, setExams] = useState([])
  const [scholarships, setScholarships] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!student?.student_id) {
      navigate('/student-login')
      return
    }
    loadData()
  }, [student])

  const loadData = async () => {
    try {
      const id = student.student_id
      const [profileRes, enrollRes, payRes, examRes, schRes] = await Promise.all([
        api.get(`/student-auth/me/${id}`),
        api.get(`/student-auth/me/${id}/enrollments`),
        api.get(`/student-auth/me/${id}/payments`),
        api.get(`/student-auth/me/${id}/exams`),
        api.get(`/student-auth/me/${id}/scholarships`)
      ])
      setProfile(profileRes.data)
      setEnrollments(enrollRes.data)
      setPayments(payRes.data)
      setExams(examRes.data)
      setScholarships(schRes.data)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/student-login')
  }

  if (loading) return <div className="spinner"></div>

  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0)

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ 
        background: 'white', borderBottom: '1px solid #e2e8f0', 
        padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ 
            width: '40px', height: '40px', background: '#2563eb', borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 'bold', fontSize: '1.2rem'
          }}>E</div>
          <span style={{ fontSize: '1.25rem', fontWeight: '700' }}>EduBase Student Portal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: '600' }}>{profile?.full_name}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{profile?.registration_no}</div>
          </div>
          <div style={{ 
            width: '40px', height: '40px', background: '#2563eb', borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: '600'
          }}>{profile?.full_name?.charAt(0)}</div>
          <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '2rem' }}>My Dashboard</h1>

        {/* Profile Card */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>📋 My Profile</h2>
          <div className="form-row">
            <div><strong>Name:</strong> {profile?.full_name}</div>
            <div><strong>Email:</strong> {profile?.email}</div>
            <div><strong>Phone:</strong> {profile?.phone || 'N/A'}</div>
          </div>
          <div className="form-row">
            <div><strong>Program:</strong> {profile?.program_name}</div>
            <div><strong>Advisor:</strong> {profile?.advisor_name || 'Not assigned'}</div>
            <div><strong>Status:</strong> 
              <span className={`badge badge-${profile?.current_status === 'active' ? 'success' : 'danger'}`}>
                {profile?.current_status}
              </span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon blue">📊</div>
            <div className="stat-value">{parseFloat(profile?.current_cgpa || 0).toFixed(2)}</div>
            <div className="stat-label">Current CGPA</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">📚</div>
            <div className="stat-value">{enrollments.length}</div>
            <div className="stat-label">Enrolled Courses</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon orange">💰</div>
            <div className="stat-value">৳{totalPaid.toLocaleString()}</div>
            <div className="stat-label">Total Paid</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon purple">🎓</div>
            <div className="stat-value">{scholarships.length}</div>
            <div className="stat-label">Scholarships</div>
          </div>
        </div>

        {/* Enrollments */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>📚 My Courses</h2>
          {enrollments.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Year/Term</th>
                    <th>Credits</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map(e => (
                    <tr key={e.enrollment_id}>
                      <td>{e.course_code} - {e.course_title}</td>
                      <td>{e.academic_year} / {e.term}</td>
                      <td>{e.credit_hours}</td>
                      <td>
                        <span className={`badge badge-${e.status === 'enrolled' ? 'success' : 'secondary'}`}>
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty-state">No enrollments yet</p>}
        </div>

        {/* Recent Exams */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>📝 My Exam Results</h2>
          {exams.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Exam Type</th>
                    <th>Marks</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.slice(0, 5).map(ex => (
                    <tr key={ex.exam_id}>
                      <td>{ex.course_code} - {ex.course_title}</td>
                      <td>{ex.exam_type}</td>
                      <td>{ex.obtained_marks || '0'}/{ex.total_marks}</td>
                      <td><strong>{ex.grade || '-'}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty-state">No exam results yet</p>}
        </div>

        {/* Payments & Scholarships */}
        <div className="form-row">
          <div className="card">
            <h2 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>💰 Payments</h2>
            {payments.length > 0 ? (
              <div className="table-container">
                <table>
                  <thead>
                    <tr><th>Type</th><th>Amount</th><th>Date</th></tr>
                  </thead>
                  <tbody>
                    {payments.slice(0, 5).map(p => (
                      <tr key={p.payment_id}>
                        <td>{p.payment_type}</td>
                        <td>৳{parseFloat(p.amount).toLocaleString()}</td>
                        <td>{new Date(p.paid_on).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="empty-state">No payments recorded</p>}
          </div>

          <div className="card">
            <h2 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>🎓 Scholarships</h2>
            {scholarships.length > 0 ? (
              <div className="table-container">
                <table>
                  <thead>
                    <tr><th>Name</th><th>Amount</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {scholarships.map(s => (
                      <tr key={s.scholarship_id}>
                        <td>{s.scholarship_name}</td>
                        <td>৳{parseFloat(s.amount).toLocaleString()}</td>
                        <td><span className={`badge badge-${s.status === 'active' ? 'success' : 'secondary'}`}>{s.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="empty-state">No scholarships</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default StudentDashboard