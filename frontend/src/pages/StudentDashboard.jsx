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
import CgpaValue, { formatCgpa } from '../components/CgpaValue'

const TERM_OPTIONS = [1, 2, 3, 4].flatMap(level =>
  [1, 2].map(term => ({ level, term, label: `Level ${level}, Term ${term}` }))
)

const StudentDashboard = () => {
  const { student, logout } = useStudentAuth()
  const navigate = useNavigate()
  const studentId = student?.student_id
  const currentYear = new Date().getFullYear()

  const [view, setView] = useViewState(
    'edubase_student_view',
    {
      tab: 'profile',
      year: `${currentYear}-${currentYear + 1}`,
      resultTerm: ''
    }
  )

  const activeTab = view.tab
  const regYear = view.year
  const resultTerm = view.resultTerm

  const setActiveTab = tab => setView({ tab })
  const setRegYear = year => setView({ year })
  const setResultTerm = value => setView({ resultTerm: value })

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
  const [registrations, setRegistrations] = useState([])
  const [termInfo, setTermInfo] = useState(null)
  const [result, setResult] = useState(null)
  const [resultLoading, setResultLoading] = useState(false)
  const [payments, setPayments] = useState([])
  const [scholarships, setScholarships] = useState([])
  const [scholarshipOptions, setScholarshipOptions] = useState([])
  const [scholarshipApplications, setScholarshipApplications] = useState([])
  const [selectedScholarship, setSelectedScholarship] = useState('')
  const [applying, setApplying] = useState(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [registering, setRegistering] = useState(false)

  const [paymentConfig, setPaymentConfig] = useState({
    enabled: false
  })

  const [selectedPayment, setSelectedPayment] = useState(null)
  const [paying, setPaying] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  const dataVersion = useRef(0)
  const coursesVersion = useRef(0)
  const resultVersion = useRef(0)

  const loadProfile = useCallback(async () => {
    if (!studentId) return

    const version = ++dataVersion.current

    try {
      const [
        person,
        enrolled,
        requests,
        paid,
        awards,
        scholarshipOpts,
        scholarshipApps,
        personal,
        paymentOptions
      ] = await Promise.all([
        api.get(`/student-auth/me/${studentId}`),
        api.get(`/student-auth/me/${studentId}/enrollments`),
        api.get(`/student-auth/me/${studentId}/registrations`),
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
      setRegistrations(requests.data)
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

  // Only the student's own department + current level/term.
  const loadTerm = useCallback(async () => {
    if (!studentId) return

    const version = ++coursesVersion.current

    try {
      const { data } = await api.get(
        `/student-auth/courses/${studentId}`
      )

      if (version === coursesVersion.current) {
        setTermInfo(data)
      }
    } catch (error) {
      if (version === coursesVersion.current) {
        setError(error.message)
      }
    }
  }, [studentId])

  const loadResult = useCallback(async () => {
    if (!studentId || !resultTerm) {
      setResult(null)
      return
    }

    const version = ++resultVersion.current
    const [level, term] = resultTerm.split('-')

    setResultLoading(true)

    try {
      const { data } = await api.get(
        `/student-auth/me/${studentId}/results?level=${level}&term=${term}`
      )

      if (version === resultVersion.current) {
        setResult(data)
      }
    } catch (error) {
      if (version === resultVersion.current) {
        setError(error.message)
      }
    } finally {
      if (version === resultVersion.current) {
        setResultLoading(false)
      }
    }
  }, [studentId, resultTerm])

  useEffect(() => {
    if (!studentId) {
      navigate('/student-login')
      return
    }

    void loadProfile()

    return () => {
      dataVersion.current++
      coursesVersion.current++
      resultVersion.current++
    }
  }, [studentId, loadProfile, navigate])

  useEffect(() => {
    if (activeTab === 'courses') {
      void loadTerm()
    }
  }, [activeTab, loadTerm])

  useEffect(() => {
    if (activeTab === 'results') {
      void loadResult()
    }
  }, [activeTab, loadResult])

  useLiveUpdates(async () => {
    await loadProfile()

    if (activeTab === 'courses') {
      await loadTerm()
    }

    if (activeTab === 'results') {
      await loadResult()
    }
  })

  // All courses of the term are mandatory and submitted together.
  const handleRegisterTerm = async () => {
    if (!termInfo || registering) return

    setRegistering(true)
    setMessage('')
    setError('')

    try {
      await api.post('/course-registration/request', {
        student_id: studentId,
        course_ids: termInfo.courses.map(course => course.course_id),
        academic_year: regYear
      })

      setMessage(
        'Registration submitted for all courses of your term. The decision will appear here automatically.'
      )

      await Promise.all([loadProfile(), loadTerm()])
    } catch (error) {
      setError(error.message)
    } finally {
      setRegistering(false)
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

  const registration = termInfo?.registration
  const openRegistration =
    registration && registration.status !== 'rejected'

  const registrationText = item => {
    if (item.status === 'pending') return 'Awaiting admin approval'
    if (item.status === 'rejected') {
      return item.rejection_reason || 'Rejected'
    }

    return item.complete
      ? 'Complete — all courses enrolled'
      : `Approved — ${item.active_count} of ${item.courses.length} course fees paid`
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
                <CgpaValue value={profile?.current_cgpa} />
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
                <strong>Current term:</strong>{' '}
                Level {profile?.current_level}, Term {profile?.current_term}
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
              <h3>
                Term registration
                {termInfo && ` — ${termInfo.department_code} Level ${termInfo.level}, Term ${termInfo.term}`}
              </h3>

              <p>
                All {termInfo?.required ?? 5} courses of your current
                term are mandatory and are registered together.
                Registration is complete once every course fee is paid.
              </p>

              {!termInfo ? (
                <div className="spinner" />
              ) : (
                <>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Course Code</th>
                          <th>Course Title</th>
                          <th>Credits</th>
                          <th>Status</th>
                        </tr>
                      </thead>

                      <tbody>
                        {termInfo.courses.map(course => {
                          const row = openRegistration
                            ? registration.courses.find(
                                item => item.course_id === course.course_id
                              )
                            : null

                          return (
                            <tr key={course.course_id}>
                              <td>{course.course_code}</td>
                              <td>{course.course_title}</td>
                              <td>{course.credit_hours}</td>

                              <td>
                                {row?.enrollment_status === 'pending_payment' ? (
                                  <span className="badge badge-warning">
                                    Pending Payment — pay above
                                  </span>
                                ) : row?.enrollment_status ? (
                                  <span className={`badge badge-${
                                    row.enrollment_status === 'dropped'
                                      ? 'danger'
                                      : 'success'
                                  }`}>
                                    {row.enrollment_status === 'enrolled'
                                      ? 'Enrolled'
                                      : row.enrollment_status}
                                  </span>
                                ) : registration?.status === 'pending' ? (
                                  <span className="badge badge-warning">
                                    Pending approval
                                  </span>
                                ) : (
                                  <span className="badge badge-secondary">
                                    Not registered
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {!termInfo.courses.length && (
                    <p className="empty-state">
                      No courses are listed for your term yet.
                    </p>
                  )}

                  {openRegistration ? (
                    <p>
                      <span className={`badge badge-${
                        registration.complete ? 'success' : 'warning'
                      }`}>
                        {registrationText(registration)}
                      </span>
                    </p>
                  ) : (
                    <div className="form-row" style={{ alignItems: 'flex-end' }}>
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
                        <button
                          className="btn btn-primary"
                          disabled={
                            registering ||
                            termInfo.courses.length !== termInfo.required
                          }
                          onClick={handleRegisterTerm}
                        >
                          {registering
                            ? 'Submitting…'
                            : `Register for all ${termInfo.courses.length} courses`}
                        </button>
                      </div>
                    </div>
                  )}

                  {registration?.status === 'rejected' && (
                    <p>
                      Your previous request was rejected:
                      {' '}
                      {registration.rejection_reason || 'no reason given'}.
                      You can submit again.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="card">
              <h3>My registrations</h3>

              {registrations.length ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Term</th>
                        <th>Year</th>
                        <th>Courses</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {registrations.map(item => (
                        <tr key={item.registration_id}>
                          <td>
                            {item.department_code} {item.level}-{item.term}
                          </td>

                          <td>{item.academic_year}</td>

                          <td>
                            {item.courses
                              .map(course => course.course_code)
                              .join(', ')}
                          </td>

                          <td>
                            <span className={`badge badge-${
                              item.status === 'rejected'
                                ? 'danger'
                                : item.complete
                                  ? 'success'
                                  : 'warning'
                            }`}>
                              {registrationText(item)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">
                  No registrations yet
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'results' && (
          <div>
            <h2>My Results</h2>

            <div className="card">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="result-term">
                    Level / Term
                  </label>

                  <select
                    id="result-term"
                    className="form-select"
                    value={resultTerm}
                    onChange={event =>
                      setResultTerm(event.target.value)
                    }
                  >
                    <option value="">Select level and term</option>

                    {TERM_OPTIONS.map(option => (
                      <option
                        key={option.label}
                        value={`${option.level}-${option.term}`}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <span className="form-label">Current CGPA</span>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                    <CgpaValue
                      value={result ? result.cgpa.value : profile?.current_cgpa}
                    />
                  </div>
                </div>
              </div>

              {!resultTerm ? (
                <p className="empty-state">
                  Select a level and term to view its result.
                </p>
              ) : resultLoading && !result ? (
                <div className="spinner" />
              ) : result && !result.published ? (
                <div className="empty-state">
                  <h3>Not published yet</h3>

                  <p>
                    {result.withheld
                      ? 'Results for this term are out, but yours is not published yet because some of your marks are incomplete. Please contact your department.'
                      : `The Level ${result.level}, Term ${result.term} result has not been published yet.`}
                  </p>
                </div>
              ) : result ? (
                <>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Course</th>
                          <th>Credits</th>
                          {result.components.map(component => (
                            <th key={component.key}>
                              {component.label} ({component.max})
                            </th>
                          ))}
                          <th>Total (100)</th>
                          <th>Grade</th>
                          <th>Grade point</th>
                        </tr>
                      </thead>

                      <tbody>
                        {result.courses.map(course => (
                          <tr key={course.course_code}>
                            <td>
                              {course.course_code}
                              {' — '}
                              {course.course_title}
                            </td>

                            <td>{Number(course.credit_hours).toFixed(2)}</td>

                            {result.components.map(component => (
                              <td key={component.key}>
                                {Number(course[component.key])}
                              </td>
                            ))}

                            <td>{Number(course.total)}</td>
                            <td>{course.letter_grade}</td>
                            <td>{Number(course.grade_point).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="stats-grid" style={{ marginTop: '1rem' }}>
                    <div className="stat-card">
                      <div className="stat-value">
                        {result.gpa.toFixed(2)}
                      </div>
                      <div className="stat-label">
                        Term GPA ({result.credits} credits)
                      </div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-value">
                        {formatCgpa(result.cgpa.value)}
                      </div>
                      <div className="stat-label">
                        Current CGPA ({result.cgpa.completed_terms}
                        {' '}completed term{result.cgpa.completed_terms === 1 ? '' : 's'})
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
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