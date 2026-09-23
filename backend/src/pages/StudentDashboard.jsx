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
import CoursePaymentPanel from '../components/CoursePaymentPanel'
import PaymentHistory from '../components/PaymentHistory'

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
        (_, index) =>
          `${currentYear + 1 - index}-${currentYear + 2 - index}`
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

  const [paymentConfig, setPaymentConfig] = useState({
    enabled: false
  })

  const [selectedPayment, setSelectedPayment] = useState(null)
  const [paying, setPaying] = useState(false)
  const [paymentError, setPaymentError] = useState('')

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
        personal,
        paymentOptions
      ] = await Promise.all([
        api.get(`/student-auth/me/${studentId}`),

        api.get(
          `/student-auth/me/${studentId}/enrollments`
        ),

        api.get(
          `/student-auth/me/${studentId}/course-requests`
        ),

        api.get(
          `/student-auth/me/${studentId}/exams`
        ),

        api.get(
          `/student-auth/me/${studentId}/payments`
        ),

        api.get(
          `/student-auth/me/${studentId}/scholarships`
        ),

        api.get('/profile/me', {
          role: 'student'
        }),

        api.get('/student-payments/config', {
          role: 'student'
        })
      ])

      // Ignore an older response if a newer refresh has started.
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
      setPaymentConfig(paymentOptions.data)
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

  // Refresh data without resetting the selected dashboard tab.
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

  const openPayment = enrollment => {
    setPaymentError('')
    setSelectedPayment(enrollment)
  }

  const closePayment = () => {
    if (paying) return

    setSelectedPayment(null)
    setPaymentError('')
  }

  const payCourse = async () => {
    if (!selectedPayment || paying) return

    setPaying(true)
    setPaymentError('')

    try {
      // The amount and student identity are resolved by the server.
      const { data } = await api.post(
        `/student-payments/enrollments/${selectedPayment.enrollment_id}/pay`,
        { confirm: true },
        { role: 'student' }
      )

      setSelectedPayment(null)

      setMessage(
        `${data.message} Receipt: ${data.payment.receipt_no}`
      )

      await loadProfile()
    } catch (err) {
      setPaymentError(err.message)
    } finally {
      setPaying(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/student-login')
  }

  if (loading) {
    return <div className="spinner" />
  }

  const confirmedEnrollments = enrollments.filter(
    enrollment =>
      enrollment.status !== 'pending_payment'
  )

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'courses', label: 'Courses', icon: '📚' },
    { id: 'results', label: 'Results', icon: '📊' },
    { id: 'payments', label: 'Payments', icon: '💳' },
    { id: 'scholarships', label: 'Scholarships', icon: '🎓' }
  ]

  const requestDecision = request => {
    if (request.status !== 'approved') {
      return (
        request.rejection_reason ||
        'Awaiting admin review'
      )
    }

    if (
      request.enrollment_status === 'pending_payment'
    ) {
      return 'Pending Payment — ৳1,000'
    }

    if (request.enrollment_status === 'enrolled') {
      return 'Enrolled'
    }

    return (
      request.enrollment_status ||
      'Contact registrar'
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc'
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              background: '#2563eb',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '1.2rem'
            }}
          >
            E
          </div>

          <span
            style={{
              fontSize: '1.25rem',
              fontWeight: 700
            }}
          >
            EduBase Student Portal
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600 }}>
              {profile?.full_name}
            </div>

            {profile?.bengali_name && (
              <div lang="bn">
                {profile.bengali_name}
              </div>
            )}

            <div
              style={{
                fontSize: '0.8rem',
                color: '#64748b'
              }}
            >
              {profile?.registration_no}
            </div>
          </div>

          <ProfileAvatar
            src={profile?.profile_photo}
            name={profile?.full_name || ''}
            size={44}
          />

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div
        style={{
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 2rem',
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap'
        }}
      >
        {tabs.map(tab => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '1rem 1.5rem',
              border: 'none',
              background:
                activeTab === tab.id
                  ? '#2563eb'
                  : 'transparent',
              color:
                activeTab === tab.id
                  ? 'white'
                  : '#64748b',
              cursor: 'pointer',
              fontWeight: 500,
              borderBottom:
                activeTab === tab.id
                  ? '3px solid #2563eb'
                  : '3px solid transparent',
              marginBottom: '-1px'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div
        style={{
          padding: '2rem',
          maxWidth: 1200,
          margin: '0 auto'
        }}
      >
        {error && (
          <p
            role="alert"
            className="badge badge-danger"
            style={{ display: 'block', marginBottom: 12 }}
          >
            {error}
          </p>
        )}

        {message && (
          <p
            role="status"
            className="badge badge-success"
            style={{ display: 'block', marginBottom: 12 }}
          >
            {message}
          </p>
        )}

        {/* Profile stays mounted to preserve unsaved inputs. */}
        <div hidden={activeTab !== 'profile'}>
          <h2
            style={{
              fontSize: '1.5rem',
              marginBottom: '1.5rem'
            }}
          >
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
            <h3>Academic Information</h3>

            <div className="form-row">
              <div>
                <strong>Registration:</strong>{' '}
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
                {Number(
                  profile?.computed_cgpa ?? profile?.current_cgpa ?? 0
                ).toFixed(2)}
              </div>
            </div>

            <div className="form-row">
              <div>
                <strong>Admission date:</strong>{' '}
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

        {/* Courses */}
        {activeTab === 'courses' && (
          <div>
            <h2
              style={{
                fontSize: '1.5rem',
                marginBottom: '1.5rem'
              }}
            >
              Course Registration
            </h2>

            <CoursePaymentPanel
              enrollments={enrollments}
              enabled={paymentConfig.enabled}
              busy={paying}
              onPay={openPayment}
            />

            <div
              className="card"
              style={{ marginBottom: '1.5rem' }}
            >
              <h3>My Enrolled Courses</h3>

              {confirmedEnrollments.length ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th>Year / term</th>
                        <th>Credits</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {confirmedEnrollments.map(
                        enrollment => (
                          <tr key={enrollment.enrollment_id}>
                            <td>
                              {enrollment.course_code}
                              {' — '}
                              {enrollment.course_title}
                            </td>

                            <td>
                              {enrollment.academic_year}
                              {' / '}
                              {enrollment.term}
                            </td>

                            <td>
                              {enrollment.credit_hours}
                            </td>

                            <td>
                              <span
                                className={`badge badge-${
                                  enrollment.status === 'dropped'
                                    ? 'danger'
                                    : 'success'
                                }`}
                              >
                                {enrollment.status}
                              </span>
                            </td>
                          </tr>
                        )
                      )}
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
                            <span
                              className={`badge badge-${
                                request.status === 'approved'
                                  ? 'success'
                                  : request.status === 'rejected'
                                    ? 'danger'
                                    : 'warning'
                              }`}
                            >
                              {request.status}
                            </span>
                          </td>

                          <td>
                            {requestDecision(request)}
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
              <h3>Request New Courses</h3>

              <div
                className="form-row"
                style={{ marginBottom: '1rem' }}
              >
                <div className="form-group">
                  <label
                    className="form-label"
                    htmlFor="student-course-level"
                  >
                    Filter by Level
                  </label>

                  <select
                    id="student-course-level"
                    className="form-select"
                    value={selectedLevel}
                    onChange={event =>
                      setSelectedLevel(event.target.value)
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
                  <label
                    className="form-label"
                    htmlFor="student-course-year"
                  >
                    Academic Year
                  </label>

                  <select
                    id="student-course-year"
                    className="form-select"
                    value={regYear}
                    onChange={event =>
                      setRegYear(event.target.value)
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
                  <label
                    className="form-label"
                    htmlFor="student-course-term"
                  >
                    Term
                  </label>

                  <select
                    id="student-course-term"
                    className="form-select"
                    value={regTerm}
                    onChange={event =>
                      setRegTerm(event.target.value)
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
                      <th>Level / term</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {availableCourses.map(course => {
                      const currentEnrollment =
                        enrollments.find(enrollment =>
                          enrollment.course_id ===
                            course.course_id &&
                          enrollment.academic_year === regYear &&
                          enrollment.term === regTerm
                        )

                      const hasPending =
                        courseRequests.some(request =>
                          request.course_id ===
                            course.course_id &&
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
                            Level {Math.ceil(course.term_no / 2)}
                            /Term {course.term_no % 2 || 2}
                          </td>

                          <td>
                            {currentEnrollment?.status ===
                              'pending_payment' ? (
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'flex-start',
                                  gap: '0.5rem'
                                }}
                              >
                                <span className="badge badge-warning">
                                  Pending Payment
                                </span>

                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={
                                    paying ||
                                    !paymentConfig.enabled
                                  }
                                  onClick={() =>
                                    openPayment(
                                      currentEnrollment
                                    )
                                  }
                                >
                                  Pay ৳1,000 (Demo)
                                </button>

                                {!paymentConfig.enabled && (
                                  <small
                                    style={{
                                      color: '#dc2626'
                                    }}
                                  >
                                    Demo payments are disabled
                                    on the server.
                                  </small>
                                )}
                              </div>
                            ) : currentEnrollment ? (
                              <span
                                className={`badge badge-${
                                  currentEnrollment.status ===
                                    'dropped'
                                    ? 'danger'
                                    : 'success'
                                }`}
                              >
                                {currentEnrollment.status ===
                                  'enrolled'
                                  ? 'Enrolled'
                                  : currentEnrollment.status}
                              </span>
                            ) : hasPending ? (
                              <span className="badge badge-warning">
                                Pending approval
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                disabled={
                                  requestingCourse !== null
                                }
                                onClick={() =>
                                  handleRequestCourse(
                                    course.course_id
                                  )
                                }
                              >
                                {requestingCourse ===
                                  course.course_id
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

        {/* Results */}
        {activeTab === 'results' && (
          <div>
            <h2>My Results</h2>

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
                            {' — '}
                            {exam.course_title}
                          </td>

                          <td>{exam.exam_type}</td>

                          <td>
                            {exam.obtained_marks ?? 'Not graded'}
                            /{exam.total_marks}
                          </td>

                          <td>
                            <strong>{exam.grade || '—'}</strong>
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

        {/* Payments */}
        {activeTab === 'payments' && (
          <div>
            <h2>My Payments</h2>

            <CoursePaymentPanel
              enrollments={enrollments}
              enabled={paymentConfig.enabled}
              busy={paying}
              onPay={openPayment}
            />

            <PaymentHistory payments={payments} />
          </div>
        )}

        {/* Scholarships */}
        {activeTab === 'scholarships' && (
          <div>
            <h2>My Scholarships</h2>

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
                        <th>Valid until</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {scholarships.map(scholarship => (
                        <tr key={scholarship.scholarship_id}>
                          <td>
                            {scholarship.scholarship_name}
                          </td>

                          <td>{scholarship.award_type}</td>

                          <td>
                            ৳{Number(
                              scholarship.amount || 0
                            ).toLocaleString()}
                          </td>

                          <td>
                            {scholarship.awarded_on
                              ? new Date(
                                  scholarship.awarded_on
                                ).toLocaleDateString()
                              : 'N/A'}
                          </td>

                          <td>
                            {scholarship.valid_until
                              ? new Date(
                                  scholarship.valid_until
                                ).toLocaleDateString()
                              : 'N/A'}
                          </td>

                          <td>
                            <span
                              className={`badge badge-${
                                scholarship.status === 'active'
                                  ? 'success'
                                  : 'secondary'
                              }`}
                            >
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

      {/* Demo payment confirmation */}
      {selectedPayment && (
        <div
          className="modal-overlay"
          onClick={closePayment}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-payment-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2
                id="demo-payment-title"
                className="modal-title"
              >
                Demo Course Payment
              </h2>

              <button
                type="button"
                className="modal-close"
                aria-label="Close payment dialog"
                disabled={paying}
                onClick={closePayment}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <p>
                <strong>
                  {selectedPayment.course_code}
                  {' — '}
                  {selectedPayment.course_title}
                </strong>
              </p>

              <p>
                {selectedPayment.academic_year}
                {' / '}
                {selectedPayment.term}
              </p>

              <h3>
                ৳{Number(
                  selectedPayment.course_fee
                ).toLocaleString()}
              </h3>

              <p>
                This is a project demonstration.
                No card, bank account or mobile-wallet
                money will be charged.
              </p>

              <p>
                Confirming records one demo receipt and
                completes this course enrollment.
              </p>

              {paymentError && (
                <p
                  role="alert"
                  className="badge badge-danger"
                  style={{ display: 'block' }}
                >
                  {paymentError}
                </p>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={paying}
                onClick={closePayment}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  paying ||
                  !paymentConfig.enabled
                }
                onClick={payCourse}
              >
                {paying
                  ? 'Processing…'
                  : 'Confirm demo payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StudentDashboard