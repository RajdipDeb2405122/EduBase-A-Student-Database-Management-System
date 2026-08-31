import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStudentAuth } from '../context/StudentAuthContext'
import api from '../api'

const StudentDashboard = () => {
  const { student, logout } = useStudentAuth()
  const navigate = useNavigate()
  
  // Tabs
  const [activeTab, setActiveTab] = useState('profile')
  
  // Data states
  const [profile, setProfile] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [courseRequests, setCourseRequests] = useState([])
  const [availableCourses, setAvailableCourses] = useState([])
  const [exams, setExams] = useState([])
  const [payments, setPayments] = useState([])
  const [scholarships, setScholarships] = useState([])
  
  // Loading
  const [loading, setLoading] = useState(true)
  
  // Course registration form
  const [selectedLevel, setSelectedLevel] = useState('')
  const [regYear, setRegYear] = useState('2024-2025')
  const [regTerm, setRegTerm] = useState('Fall')
  const [selectedCourses, setSelectedCourses] = useState([])

  useEffect(() => {
    if (!student?.student_id) {
      navigate('/student-login')
      return
    }
    loadProfile()
  }, [student])

  useEffect(() => {
    if (profile && activeTab === 'courses') {
      loadAvailableCourses()
    }
  }, [activeTab, profile, selectedLevel])

  const loadProfile = async () => {
    try {
      const id = student.student_id
      const [profileRes, enrollRes, reqRes, examRes, payRes, schRes] = await Promise.all([
        api.get(`/student-auth/me/${id}`),
        api.get(`/student-auth/me/${id}/enrollments`),
        api.get(`/student-auth/me/${id}/course-requests`),
        api.get(`/student-auth/me/${id}/exams`),
        api.get(`/student-auth/me/${id}/payments`),
        api.get(`/student-auth/me/${id}/scholarships`)
      ])
      setProfile(profileRes.data)
      setEnrollments(enrollRes.data)
      setCourseRequests(reqRes.data)
      setExams(examRes.data)
      setPayments(payRes.data)
      setScholarships(schRes.data)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadAvailableCourses = async () => {
    try {
      let url = `/student-auth/courses/${student.student_id}`
      if (selectedLevel) {
        url += `?level=${selectedLevel}`
      }
      const { data } = await api.get(url)
      setAvailableCourses(data)
    } catch (err) {
      console.error('Failed to load courses:', err)
    }
  }

  const handleRequestCourse = async (courseId) => {
    try {
      await api.post('/course-registration/request', {
        student_id: student.student_id,
        course_id: courseId,
        academic_year: regYear,
        term: regTerm
      })
      alert('Course registration request submitted!')
      loadProfile()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/student-login')
  }

  if (loading) return <div className="spinner"></div>

  const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0)

  // Calculate level from term numbers
  const getLevelFromTerm = (termNo) => {
    return Math.ceil(termNo / 2)
  }

  const tabs = [
    { id: 'profile', label: '📋 Profile', icon: '👤' },
    { id: 'courses', label: '📚 Courses', icon: '📚' },
    { id: 'results', label: '📝 Results', icon: '📊' },
    { id: 'payments', label: '💰 Payments', icon: '💳' },
    { id: 'scholarships', label: '🎓 Scholarships', icon: '🎓' }
  ]

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

      {/* Tabs */}
      <div style={{ 
        background: 'white', borderBottom: '1px solid #e2e8f0',
        padding: '0 2rem', display: 'flex', gap: '0.5rem'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '1rem 1.5rem',
              border: 'none',
              background: activeTab === tab.id ? '#2563eb' : 'transparent',
              color: activeTab === tab.id ? 'white' : '#64748b',
              cursor: 'pointer',
              fontWeight: '500',
              borderBottom: activeTab === tab.id ? '3px solid #2563eb' : '3px solid transparent',
              marginBottom: '-1px'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>My Profile</h2>
            
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem', color: '#2563eb' }}>Personal Information</h3>
              <div className="form-row">
                <div><strong>Name:</strong> {profile?.full_name}</div>
                <div><strong>Registration No:</strong> {profile?.registration_no || 'Not assigned'}</div>
                <div><strong>Email:</strong> {profile?.email}</div>
              </div>
              <div className="form-row">
                <div><strong>Phone:</strong> {profile?.phone || 'Not provided'}</div>
                <div><strong>Date of Birth:</strong> {profile?.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString() : 'Not provided'}</div>
                <div><strong>Status:</strong> 
                  <span className={`badge badge-${profile?.current_status === 'active' ? 'success' : 'danger'}`}>
                    {profile?.current_status}
                  </span>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem', color: '#2563eb' }}>Academic Information</h3>
              <div className="form-row">
                <div><strong>Program:</strong> {profile?.program_name}</div>
                <div><strong>Department:</strong> {profile?.department_name}</div>
                <div><strong>Degree:</strong> {profile?.degree_level}</div>
              </div>
              <div className="form-row">
                <div><strong>Advisor:</strong> {profile?.advisor_name || 'Not assigned'}</div>
                <div><strong>CGPA:</strong> {parseFloat(profile?.current_cgpa || 0).toFixed(2)}</div>
                <div><strong>Admission Date:</strong> {profile?.admission_date ? new Date(profile.admission_date).toLocaleDateString() : 'N/A'}</div>
              </div>
            </div>
          </div>
        )}

        {/* COURSES TAB */}
        {activeTab === 'courses' && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>Course Registration</h2>
            
            {/* My Enrollments */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem', color: '#10b981' }}>✓ My Enrolled Courses</h3>
              {enrollments.length > 0 ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr><th>Course</th><th>Year/Term</th><th>Credits</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {enrollments.map(e => (
                        <tr key={e.enrollment_id}>
                          <td>{e.course_code} - {e.course_title}</td>
                          <td>{e.academic_year} / {e.term}</td>
                          <td>{e.credit_hours}</td>
                          <td><span className="badge badge-success">{e.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="empty-state">No enrolled courses</p>}
            </div>

            {/* Pending Requests */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem', color: '#f59e0b' }}>⏳ Pending Requests</h3>
              {courseRequests.filter(r => r.status === 'pending').length > 0 ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr><th>Course</th><th>Requested On</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {courseRequests.filter(r => r.status === 'pending').map(r => (
                        <tr key={r.request_id}>
                          <td>{r.course_code} - {r.course_title}</td>
                          <td>{new Date(r.requested_on).toLocaleDateString()}</td>
                          <td><span className="badge badge-warning">Pending</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="empty-state">No pending requests</p>}
            </div>

            {/* Available Courses */}
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem', color: '#2563eb' }}>📚 Request New Courses</h3>
              
              <div className="form-row" style={{ marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Filter by Level</label>
                  <select className="form-select" value={selectedLevel} onChange={(e) => setSelectedLevel(e.target.value)}>
                    <option value="">All Levels</option>
                    <option value="1">Level 1</option>
                    <option value="2">Level 2</option>
                    <option value="3">Level 3</option>
                    <option value="4">Level 4</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Academic Year</label>
                  <select className="form-select" value={regYear} onChange={(e) => setRegYear(e.target.value)}>
                    <option value="2024-2025">2024-2025</option>
                    <option value="2023-2024">2023-2024</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Term</label>
                  <select className="form-select" value={regTerm} onChange={(e) => setRegTerm(e.target.value)}>
                    <option value="Fall">Fall</option>
                    <option value="Spring">Spring</option>
                  </select>
                </div>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr><th>Course Code</th><th>Course Title</th><th>Credits</th><th>Level/Term</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {availableCourses.map(c => {
                      const isEnrolled = enrollments.some(e => e.course_id === c.course_id)
                      const hasPending = courseRequests.some(r => r.course_id === c.course_id && r.status === 'pending')
                      return (
                        <tr key={c.course_id}>
                          <td>{c.course_code}</td>
                          <td>{c.course_title}</td>
                          <td>{c.credit_hours}</td>
                          <td>Level {getLevelFromTerm(c.term_no)}/Term {c.term_no % 2 || 2}</td>
                          <td>
                            {isEnrolled ? (
                              <span className="badge badge-success">Enrolled</span>
                            ) : hasPending ? (
                              <span className="badge badge-warning">Pending</span>
                            ) : (
                              <button className="btn btn-sm btn-primary" onClick={() => handleRequestCourse(c.course_id)}>
                                Request
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {availableCourses.length === 0 && <p className="empty-state">Select a level to view courses</p>}
            </div>
          </div>
        )}

        {/* RESULTS TAB */}
        {activeTab === 'results' && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>My Results</h2>
            <div className="card">
              {exams.length > 0 ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr><th>Course</th><th>Exam Type</th><th>Marks</th><th>Grade</th><th>Date</th></tr>
                    </thead>
                    <tbody>
                      {exams.map(ex => (
                        <tr key={ex.exam_id}>
                          <td>{ex.course_code} - {ex.course_title}</td>
                          <td>{ex.exam_type}</td>
                          <td>{ex.obtained_marks || '0'}/{ex.total_marks}</td>
                          <td><strong style={{ fontSize: '1.2rem' }}>{ex.grade || '-'}</strong></td>
                          <td>{ex.exam_date ? new Date(ex.exam_date).toLocaleDateString() : 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="empty-state">No exam results yet</p>}
            </div>
          </div>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>My Payments</h2>
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card">
                <div className="stat-icon green">💰</div>
                <div className="stat-value">৳{totalPaid.toLocaleString()}</div>
                <div className="stat-label">Total Paid</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon blue">📋</div>
                <div className="stat-value">{payments.length}</div>
                <div className="stat-label">Transactions</div>
              </div>
            </div>
            <div className="card">
              {payments.length > 0 ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr><th>Type</th><th>Year/Term</th><th>Amount</th><th>Date</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.payment_id}>
                          <td>{p.payment_type}</td>
                          <td>{p.academic_year} / {p.term}</td>
                          <td>৳{parseFloat(p.amount).toLocaleString()}</td>
                          <td>{new Date(p.paid_on).toLocaleDateString()}</td>
                          <td><span className={`badge badge-${p.status === 'paid' ? 'success' : 'warning'}`}>{p.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="empty-state">No payment records</p>}
            </div>
          </div>
        )}

        {/* SCHOLARSHIPS TAB */}
        {activeTab === 'scholarships' && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>My Scholarships</h2>
            <div className="card">
              {scholarships.length > 0 ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr><th>Scholarship</th><th>Type</th><th>Amount</th><th>Awarded</th><th>Valid Until</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {scholarships.map(s => (
                        <tr key={s.scholarship_id}>
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
              ) : <p className="empty-state">No scholarships awarded</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default StudentDashboard