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
  const [scholarshipOptions, setScholarshipOptions] = useState([])
  const [scholarshipApplications, setScholarshipApplications] = useState([])
  const [selectedScholarship, setSelectedScholarship] = useState('')
  const [applying, setApplying] = useState(false)

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
        scholarshipOpts,
        scholarshipApps,
        personal,
        paymentOptions
      ] = await Promise.all([
        api.get(`/student-auth/me/${studentId}`),
        api.get(`/student-auth/me/${studentId}/enrollments`),
        api.get(`/student-auth/me/${studentId}/course-requests`),
        api.get(`/student-auth/me/${studentId}/exams`),
        api.get(`/student-auth/me/${studentId}/payments`),
        api.get(`/student-auth/me/${studentId}/scholarships`),
        api.get(`/student-auth/me/${studentId}/scholarship-options`),
        api.get(`/student-auth/me/${studentId}/scholarship-applications`),
        api.get('/profile/me', { role: 'student' }),
        api.get('/student-payments/config', { role: 'student' })
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
      setScholarshipOptions(scholarshipOpts.data)
      setScholarshipApplications(scholarshipApps.data)
      setPaymentConfig(paymentOptions.data)
      setError('')
    } catch (error) {
      if (version === dataVersion.current) {
        setError(error.message)
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
    } catch (error) {
      if (version === coursesVersion.current) {
        setError(error.message)
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
    } catch (error) {
      setError(error.message)
    } finally {
      setRequestingCourse(null)
    }
  }

  const openPayment = enrollment => {
    setPaymentError('')
    setSelectedPayment(enrollment)
  }

  // Apply for one of the 10 predefined scholarships.
  // Only the scholarship name is sent — name and amount are
  // fixed on the server and cannot be edited.
  const handleApplyScholarship = async () => {
    if (!selectedScholarship || applying) return

    setApplying(true)
    setMessage('')
    setError('')

    try {
      await api.post(
        `/student-auth/me/${studentId}/scholarship-applications`,
        { scholarship_name: selectedScholarship }
      )

      setMessage(
        'Scholarship application submitted. It will appear below once the admin reviews it.'
      )

      setSelectedScholarship('')

      await loadProfile()
    } catch (error) {
      setError(error.message)
    } finally {
      setApplying(false)
    }
  }

  const payCourse = async () => {
    if (!selectedPayment || paying) return

    setPaying(true)
    setPaymentError('')

    try {
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
    } catch (error) {
      setPaymentError(error.message)
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
    enrollment => enrollment.status !== 'pending_payment'
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
      return request.rejection_reason || 'Awaiting admin review'
    }

    if (request.enrollment_status === 'pending_payment') {
      return 'Pending Payment — ৳1,000'
    }

    if (request.enrollment_status === 'enrolled') {
      return 'Enrolled'
    }

    return request.enrollment_status || 'Contact registrar'
  }

  return (
    <div className="portal-page">
      <header className="page-header">
        <div className="portal-identity">
          <ProfileAvatar
            src={profile?.profile_photo}
            name={profile?.full_name || ''}
            size={60}
          />

          <div>
            <h1 className="page-title">
              Student dashboard
            </h1>

            <p>
              {profile?.full_name}
              {profile?.registration_no && ` · ${profile.registration_no}`}
              {profile?.program_name && ` · ${profile.program_name}`}
            </p>

            {profile?.bengali_name && (
              <p lang="bn">
                {profile.bengali_name}
              </p>
            )}
          </div>
        </div>

        <button
          className="btn btn-secondary"
          onClick={handleLogout}
        >
          Log out
        </button>
      </header>

      <nav className="tab-nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`btn ${
              activeTab === tab.id
                ? 'btn-primary'
                : 'btn-secondary'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </nav>

      <div>
        {error && (
          <p role="alert" className="badge badge-danger" style={{ display: 'block', marginBottom: 16 }}>
            {error} — retrying automatically.
          </p>
        )}

        {message && (
          <p role="status" className="badge badge-success" style={{ display: 'block', marginBottom: 16 }}>
            {message}
          </p>
        )}

        <div hidden={activeTab !== 'profile'}>
          <h2 className="section-title">
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
                  profile?.current_cgpa || 0
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

        {activeTab === 'courses' && (
          <div>
            <h2 style={{
              fontSize: '1.5rem',
              marginBottom: '1.5rem'
            }}>
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
                      {confirmedEnrollments.map(enrollment => (
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

                          <td>{enrollment.credit_hours}</td>

                          <td>
                            <span className={`badge badge-${
                              enrollment.status === 'dropped'
                                ? 'danger'
                                : 'success'
                            }`}>
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

                          <td>{requestDecision(request)}</td>
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
                  <label className="form-label">
                    Filter by Level
                  </label>

                  <select
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
                  <label className="form-label">
                    Academic Year
                  </label>

                  <select
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
                  <label className="form-label">
                    Term
                  </label>

                  <select
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
                            Level {Math.ceil(course.term_no / 2)}
                            /Term {course.term_no % 2 || 2}
                          </td>

                          <td>
                            {currentEnrollment?.status ===
                              'pending_payment' ? (
                              <span className="badge badge-warning">
                                Pending Payment — pay above
                              </span>
                            ) : currentEnrollment ? (
                              <span className={`badge badge-${
                                currentEnrollment.status === 'dropped'
                                  ? 'danger'
                                  : 'success'
                              }`}>
                                {currentEnrollment.status === 'enrolled'
                                  ? 'Enrolled'
                                  : currentEnrollment.status}
                              </span>
                            ) : hasPending ? (
                              <span className="badge badge-warning">
                                Pending approval
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

                          <td>{exam.grade || '—'}</td>

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

        {activeTab === 'scholarships' && (
          <div>
            <h2>Apply for Scholarship</h2>

            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <p>
                Choose one of the 10 available scholarships below.
                The scholarship name and amount are fixed and
                cannot be edited. The admin will accept or reject
                your application.
              </p>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Scholarship *</label>

                  <select
                    className="form-select"
                    value={selectedScholarship}
                    onChange={event =>
                      setSelectedScholarship(event.target.value)
                    }
                  >
                    <option value="">Select a scholarship</option>

                    {scholarshipOptions.map(option => (
                      <option
                        key={option.scholarship_name}
                        value={option.scholarship_name}
                      >
                        {option.scholarship_name}
                        {' — '}
                        ৳{Number(option.amount).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">&nbsp;</label>

                  <button
                    className="btn btn-primary"
                    disabled={applying || !selectedScholarship}
                    onClick={handleApplyScholarship}
                  >
                    {applying ? 'Submitting…' : 'Apply for Scholarship'}
                  </button>
                </div>
              </div>

              {selectedScholarship && (
                <p>
                  <strong>Fixed amount:{' '}</strong>
                  ৳{Number(
                    scholarshipOptions.find(
                      option =>
                        option.scholarship_name === selectedScholarship
                    )?.amount || 0
                  ).toLocaleString()}
                </p>
              )}
            </div>

            <h2>My Applications</h2>

            <div className="card" style={{ marginBottom: '1.5rem' }}>
              {scholarshipApplications.length ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Scholarship</th>
                        <th>Amount</th>
                        <th>Applied</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {scholarshipApplications.map(application => (
                        <tr key={application.application_id}>
                          <td>{application.scholarship_name}</td>

                          <td>
                            ৳{Number(
                              application.amount || 0
                            ).toLocaleString()}
                          </td>

                          <td>
                            {new Date(
                              application.applied_on
                            ).toLocaleDateString()}
                          </td>

                          <td>
                            <span className={`badge badge-${
                              application.status === 'approved'
                                ? 'success'
                                : application.status === 'rejected'
                                  ? 'danger'
                                  : 'warning'
                            }`}>
                              {application.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">
                  No applications submitted yet
                </p>
              )}
            </div>

            <h2>Awarded Scholarships</h2>

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
                          <td>{scholarship.scholarship_name}</td>
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

                          <td>{scholarship.status}</td>
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

      {selectedPayment && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!paying) setSelectedPayment(null)
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-payment-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="course-payment-title">
                Course Payment
              </h2>
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
                Confirming records your receipt and completes
                this course enrollment.
              </p>

              {paymentError && (
                <p role="alert" className="badge badge-danger">
                  {paymentError}
                </p>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                disabled={paying}
                onClick={() => setSelectedPayment(null)}
              >
                Cancel
              </button>

              <button
                className="btn btn-primary"
                disabled={paying || !paymentConfig.enabled}
                onClick={payCourse}
              >
                {paying
                  ? 'Processing…'
                  : 'Confirm payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StudentDashboard