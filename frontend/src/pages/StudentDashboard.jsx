import {
  useState,
  useEffect,
  useCallback,
  useRef
} from 'react'

import { useNavigate } from 'react-router-dom'
import { useStudentAuth } from '../context/StudentAuthContext'
import useLiveUpdates from '../hooks/useLiveUpdates'
import useViewState from '../hooks/useViewState'
import api from '../api'
import ProfileEditor from '../components/ProfileEditor'
import ProfileAvatar from '../components/ProfileAvatar'

const StudentDashboard = () => {
  const { student, logout } = useStudentAuth()
  const navigate = useNavigate()
  const studentId = student?.student_id
  const currentYear = new Date().getFullYear()

  const [view, setView] = useViewState(
    'edubase_student_view',
    {
      tab: 'profile',
      level: '',
      year: `${currentYear}-${currentYear + 1}`,
      term: 'Fall'
    }
  )

  const activeTab = view.tab
  const selectedLevel = view.level
  const regYear = view.year
  const regTerm = view.term

  const setActiveTab = tab => setView({ tab })
  const setSelectedLevel = level => setView({ level })
  const setRegYear = year => setView({ year })
  const setRegTerm = term => setView({ term })

  const academicYears = [
    ...new Set([
      regYear,
      ...Array.from(
        { length: 5 },
        (_, i) =>
          `${currentYear + 1 - i}-${currentYear + 2 - i}`
      )
    ])
  ].sort((a, b) => b.localeCompare(a))

  const [profile, setProfile] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [courseRequests, setCourseRequests] = useState([])
  const [availableCourses, setAvailableCourses] = useState([])
  const [exams, setExams] = useState([])
  const [payments, setPayments] = useState([])
  const [scholarships, setScholarships] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [requestingCourse, setRequestingCourse] = useState(null)

  const dataVersion = useRef(0)
  const coursesVersion = useRef(0)

  const loadProfile = useCallback(async () => {
    if (!studentId) return

    const version = ++dataVersion.current

    try {
      const [
        person,
        enrolled,
        requests,
        results,
        paid,
        awards,
        personal
      ] = await Promise.all([
        api.get(`/student-auth/me/${studentId}`),
        api.get(`/student-auth/me/${studentId}/enrollments`),
        api.get(`/student-auth/me/${studentId}/course-requests`),
        api.get(`/student-auth/me/${studentId}/exams`),
        api.get(`/student-auth/me/${studentId}/payments`),
        api.get(`/student-auth/me/${studentId}/scholarships`),
        api.get('/profile/me', { role: 'student' })
      ])

      if (version !== dataVersion.current) return

      setProfile({
        ...person.data,
        ...personal.data
      })

      setEnrollments(enrolled.data)
      setCourseRequests(requests.data)
      setExams(results.data)
      setPayments(paid.data)
      setScholarships(awards.data)
      setError('')
    } catch (err) {
      if (version === dataVersion.current) {
        setError(err.message)
      }
    } finally {
      if (version === dataVersion.current) {
        setLoading(false)
      }
    }
  }, [studentId])

  const loadAvailableCourses = useCallback(async () => {
    if (!studentId) return

    const version = ++coursesVersion.current

    try {
      const query = selectedLevel
        ? `?level=${selectedLevel}`
        : ''

      const { data } = await api.get(
        `/student-auth/courses/${studentId}${query}`
      )

      if (version === coursesVersion.current) {
        setAvailableCourses(data)
      }
    } catch (err) {
      if (version === coursesVersion.current) {
        setError(err.message)
      }
    }
  }, [studentId, selectedLevel])

  useEffect(() => {
    if (!studentId) {
      navigate('/student-login')
      return
    }

    void loadProfile()

    return () => {
      dataVersion.current++
      coursesVersion.current++
    }
  }, [studentId, loadProfile, navigate])

  useEffect(() => {
    if (activeTab === 'courses') {
      void loadAvailableCourses()
    }
  }, [activeTab, loadAvailableCourses])

  useLiveUpdates(async () => {
    await loadProfile()

    if (activeTab === 'courses') {
      await loadAvailableCourses()
    }
  })

  const handleRequestCourse = async courseId => {
    setRequestingCourse(courseId)
    setMessage('')
    setError('')

    try {
      await api.post('/course-registration/request', {
        student_id: studentId,
        course_id: courseId,
        academic_year: regYear,
        term: regTerm
      })

      setMessage(
        'Request submitted. The decision will appear here automatically.'
      )

      await loadProfile()
    } catch (err) {
      setError(err.message)
    } finally {
      setRequestingCourse(null)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/student-login')
  }

  if (loading) {
    return <div className="spinner" />
  }

  const totalPaid = payments.reduce(
    (sum, payment) => sum + parseFloat(payment.amount),
    0
  )

  const getLevelFromTerm = termNo =>
    Math.ceil(termNo / 2)

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'courses', label: 'Courses', icon: '📚' },
    { id: 'results', label: 'Results', icon: '📊' },
    { id: 'payments', label: 'Payments', icon: '💳' },
    { id: 'scholarships', label: 'Scholarships', icon: '🎓' }
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc'
    }}>
      <div style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            background: '#2563eb',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '1.2rem'
          }}>
            E
          </div>

          <span style={{
            fontSize: '1.25rem',
            fontWeight: '700'
          }}>
            EduBase Student Portal
          </span>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: '600' }}>
              {profile?.full_name}
            </div>

            {profile?.bengali_name && (
              <div lang="bn">
                {profile.bengali_name}
              </div>
            )}

            <div style={{
              fontSize: '0.8rem',
              color: '#64748b'
            }}>
              {profile?.registration_no}
            </div>
          </div>

          <ProfileAvatar
            src={profile?.profile_photo}
            name={profile?.full_name || ''}
            size={44}
          />

          <button
            className="btn btn-secondary"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 2rem',
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '1rem 1.5rem',
              border: 'none',
              background: activeTab === tab.id
                ? '#2563eb'
                : 'transparent',
              color: activeTab === tab.id
                ? 'white'
                : '#64748b',
              cursor: 'pointer',
              fontWeight: '500',
              borderBottom: activeTab === tab.id
                ? '3px solid #2563eb'
                : '3px solid transparent',
              marginBottom: '-1px'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div style={{
        padding: '2rem',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        {error && (
          <p role="alert" className="badge badge-danger">
            {error} — retrying automatically.
          </p>
        )}

        {message && (
          <p role="status" className="badge badge-success">
            {message}
          </p>
        )}

        <div hidden={activeTab !== 'profile'}>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: '700',
            marginBottom: '1.5rem'
          }}>
            My Profile
          </h2>

          <ProfileEditor
            role="student"
            profile={profile}
            onSaved={personal =>
              setProfile(old => ({
                ...old,
                ...personal
              }))
            }
          />

          <div className="card">
            <h3 style={{
              fontSize: '1.1rem',
              fontWeight: '600',
              marginBottom: '1rem',
              color: '#2563eb'
            }}>
              Academic Information
            </h3>

            <div className="form-row">
              <div>
                <strong>Registration No:</strong>{' '}
                {profile?.registration_no}
              </div>

              <div>
                <strong>Program:</strong>{' '}
                {profile?.program_name}
              </div>

              <div>
                <strong>Department:</strong>{' '}
                {profile?.department_name}
              </div>
            </div>

            <div className="form-row">
              <div>
                <strong>Degree:</strong>{' '}
                {profile?.degree_level}
              </div>

              <div>
                <strong>Advisor:</strong>{' '}
                {profile?.advisor_name || 'Not assigned'}
              </div>

              <div>
                <strong>CGPA:</strong>{' '}
                {parseFloat(
                  profile?.current_cgpa || 0
                ).toFixed(2)}
              </div>
            </div>

            <div className="form-row">
              <div>
                <strong>Admission Date:</strong>{' '}
                {profile?.admission_date
                  ? new Date(
                      profile.admission_date
                    ).toLocaleDateString()
                  : 'N/A'}
              </div>

              <div>
                <strong>Status:</strong>{' '}
                {profile?.current_status}
              </div>
            </div>
          </div>
        </div>

        {activeTab === 'courses' && (
          <div>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              marginBottom: '1.5rem'
            }}>
              Course Registration
            </h2>

            <div
              className="card"
              style={{ marginBottom: '1.5rem' }}
            >
              <h3 style={{
                fontSize: '1.1rem',
                fontWeight: '600',
                marginBottom: '1rem',
                color: '#10b981'
              }}>
                My Enrolled Courses
              </h3>

              {enrollments.length ? (
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
                      {enrollments.map(enrollment => (
                        <tr key={enrollment.enrollment_id}>
                          <td>
                            {enrollment.course_code}
                            {' - '}
                            {enrollment.course_title}
                          </td>

                          <td>
                            {enrollment.academic_year}
                            {' / '}
                            {enrollment.term}
                          </td>

                          <td>{enrollment.credit_hours}</td>

                          <td>
                            <span className="badge badge-success">
                              {enrollment.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">
                  No enrolled courses
                </p>
              )}
            </div>

            <div
              className="card"
              style={{ marginBottom: '1.5rem' }}
            >
              <h3>My course requests — live status</h3>

              {courseRequests.length ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th>Year / term</th>
                        <th>Status</th>
                        <th>Decision / reason</th>
                      </tr>
                    </thead>

                    <tbody>
                      {courseRequests.map(request => (
                        <tr key={request.request_id}>
                          <td>
                            {request.course_code}
                            {' — '}
                            {request.course_title}
                          </td>

                          <td>
                            {request.academic_year}
                            {' / '}
                            {request.term}
                          </td>

                          <td>
                            <span className={`badge badge-${
                              request.status === 'approved'
                                ? 'success'
                                : request.status === 'rejected'
                                  ? 'danger'
                                  : 'warning'
                            }`}>
                              {request.status}
                            </span>
                          </td>

                          <td>
                            {request.status === 'approved'
                              ? 'Enrolled'
                              : request.rejection_reason ||
                                'Awaiting admin review'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">
                  No course requests yet
                </p>
              )}
            </div>

            <div className="card">
              <h3 style={{
                fontSize: '1.1rem',
                fontWeight: '600',
                marginBottom: '1rem',
                color: '#2563eb'
              }}>
                Request New Courses
              </h3>

              <div
                className="form-row"
                style={{ marginBottom: '1rem' }}
              >
                <div className="form-group">
                  <label className="form-label">
                    Filter by Level
                  </label>

                  <select
                    className="form-select"
                    value={selectedLevel}
                    onChange={e =>
                      setSelectedLevel(e.target.value)
                    }
                  >
                    <option value="">All Levels</option>
                    <option value="1">Level 1</option>
                    <option value="2">Level 2</option>
                    <option value="3">Level 3</option>
                    <option value="4">Level 4</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Academic Year
                  </label>

                  <select
                    className="form-select"
                    value={regYear}
                    onChange={e =>
                      setRegYear(e.target.value)
                    }
                  >
                    {academicYears.map(year => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Term
                  </label>

                  <select
                    className="form-select"
                    value={regTerm}
                    onChange={e =>
                      setRegTerm(e.target.value)
                    }
                  >
                    <option value="Fall">Fall</option>
                    <option value="Spring">Spring</option>
                  </select>
                </div>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Course Code</th>
                      <th>Course Title</th>
                      <th>Credits</th>
                      <th>Level/Term</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {availableCourses.map(course => {
                      const isEnrolled = enrollments.some(
                        enrollment =>
                          enrollment.course_id === course.course_id &&
                          enrollment.academic_year === regYear &&
                          enrollment.term === regTerm
                      )

                      const hasPending = courseRequests.some(
                        request =>
                          request.course_id === course.course_id &&
                          request.academic_year === regYear &&
                          request.term === regTerm &&
                          request.status === 'pending'
                      )

                      return (
                        <tr key={course.course_id}>
                          <td>{course.course_code}</td>
                          <td>{course.course_title}</td>
                          <td>{course.credit_hours}</td>

                          <td>
                            Level {getLevelFromTerm(course.term_no)}
                            /Term {course.term_no % 2 || 2}
                          </td>

                          <td>
                            {isEnrolled ? (
                              <span className="badge badge-success">
                                Enrolled
                              </span>
                            ) : hasPending ? (
                              <span className="badge badge-warning">
                                Pending
                              </span>
                            ) : (
                              <button
                                className="btn btn-sm btn-primary"
                                disabled={requestingCourse !== null}
                                onClick={() =>
                                  handleRequestCourse(course.course_id)
                                }
                              >
                                {requestingCourse === course.course_id
                                  ? 'Sending…'
                                  : 'Request'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {!availableCourses.length && (
                <p className="empty-state">
                  Select a level to view courses
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'results' && (
          <div>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              marginBottom: '1.5rem'
            }}>
              My Results
            </h2>

            <div className="card">
              {exams.length ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th>Exam Type</th>
                        <th>Marks</th>
                        <th>Grade</th>
                        <th>Date</th>
                      </tr>
                    </thead>

                    <tbody>
                      {exams.map(exam => (
                        <tr key={exam.exam_id}>
                          <td>
                            {exam.course_code}
                            {' - '}
                            {exam.course_title}
                          </td>

                          <td>{exam.exam_type}</td>

                          <td>
                            {exam.obtained_marks ?? 'Not graded'}
                            /{exam.total_marks}
                          </td>

                          <td>
                            <strong style={{ fontSize: '1.2rem' }}>
                              {exam.grade || '-'}
                            </strong>
                          </td>

                          <td>
                            {exam.exam_date
                              ? new Date(
                                  exam.exam_date
                                ).toLocaleDateString()
                              : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">
                  No exam results yet
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <div>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              marginBottom: '1.5rem'
            }}>
              My Payments
            </h2>

            <div
              className="stats-grid"
              style={{ marginBottom: '1.5rem' }}
            >
              <div className="stat-card">
                <div className="stat-icon green">💰</div>
                <div className="stat-value">
                  ৳{totalPaid.toLocaleString()}
                </div>
                <div className="stat-label">Total Paid</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon blue">📋</div>
                <div className="stat-value">
                  {payments.length}
                </div>
                <div className="stat-label">Transactions</div>
              </div>
            </div>

            <div className="card">
              {payments.length ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Year/Term</th>
                        <th>Amount</th>
                        <th>Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {payments.map(payment => (
                        <tr key={payment.payment_id}>
                          <td>{payment.payment_type}</td>

                          <td>
                            {payment.academic_year}
                            {' / '}
                            {payment.term}
                          </td>

                          <td>
                            ৳{parseFloat(
                              payment.amount
                            ).toLocaleString()}
                          </td>

                          <td>
                            {new Date(
                              payment.paid_on
                            ).toLocaleDateString()}
                          </td>

                          <td>
                            <span className={`badge badge-${
                              payment.status === 'paid'
                                ? 'success'
                                : 'warning'
                            }`}>
                              {payment.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">
                  No payment records
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'scholarships' && (
          <div>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              marginBottom: '1.5rem'
            }}>
              My Scholarships
            </h2>

            <div className="card">
              {scholarships.length ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Scholarship</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Awarded</th>
                        <th>Valid Until</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {scholarships.map(scholarship => (
                        <tr key={scholarship.scholarship_id}>
                          <td>{scholarship.scholarship_name}</td>
                          <td>{scholarship.award_type}</td>

                          <td>
                            ৳{parseFloat(
                              scholarship.amount
                            ).toLocaleString()}
                          </td>

                          <td>
                            {new Date(
                              scholarship.awarded_on
                            ).toLocaleDateString()}
                          </td>

                          <td>
                            {scholarship.valid_until
                              ? new Date(
                                  scholarship.valid_until
                                ).toLocaleDateString()
                              : 'N/A'}
                          </td>

                          <td>
                            <span className={`badge badge-${
                              scholarship.status === 'active'
                                ? 'success'
                                : 'secondary'
                            }`}>
                              {scholarship.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">
                  No scholarships awarded
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default StudentDashboard