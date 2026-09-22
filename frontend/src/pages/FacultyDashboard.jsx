import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'

import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import useLiveUpdates from '../hooks/useLiveUpdates'
import useViewState from '../hooks/useViewState'
import ProfileEditor from '../components/ProfileEditor'
import ProfileAvatar from '../components/ProfileAvatar'

const calendarDate = value =>
  value ? String(value).slice(0, 10) : 'Not scheduled'

const marksText = row =>
  `${row.obtained_marks ?? 'Not graded'} / ${row.total_marks}`

export default function FacultyDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [data, setData] = useState(null)

  const [view, setView] = useViewState(
    'edubase_faculty_view',
    { tab: 'overview' }
  )

  const tab = view.tab
  const setTab = nextTab => {
    setMessage('')
    setView({ tab: nextTab })
  }

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [roster, setRoster] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [progress, setProgress] = useState(null)
  const [publishRequests, setPublishRequests] = useState([])

  const year = new Date().getFullYear()

  const [exam, setExam] = useState({
    course_id: '',
    academic_year: `${year}-${year + 1}`,
    term: 'Fall',
    exam_type: 'Midterm',
    exam_date: '',
    total_marks: '100'
  })

  const dirtyRows = useRef(new Set())
  const busyRef = useRef(false)
  const rosterId = useRef(null)
  const progressId = useRef(null)
  const dataVersion = useRef(0)
  const rosterVersion = useRef(0)

  const loadRoster = useCallback(
    async (examId, automatic = false) => {
      if (
        automatic &&
        rosterId.current !== examId
      ) {
        return
      }

      if (
        !automatic &&
        rosterId.current !== examId
      ) {
        if (
          dirtyRows.current.size &&
          !window.confirm(
            'Discard unsaved marks and open another exam?'
          )
        ) {
          return
        }

        dirtyRows.current.clear()
        rosterId.current = examId
      }

      const version = ++rosterVersion.current

      const { data: next } = await api.get(
        `/faculty-portal/exams/${examId}/roster`
      )

      if (
        version !== rosterVersion.current ||
        rosterId.current !== examId
      ) {
        return
      }

      setRoster(next)

      setDrafts(old =>
        Object.fromEntries(
          next.students.map(student => [
            student.enrollment_id,

            dirtyRows.current.has(student.enrollment_id) &&
            old[student.enrollment_id]
              ? old[student.enrollment_id]
              : {
                  obtained_marks:
                    student.obtained_marks ?? '',
                  remarks: student.remarks || ''
                }
          ])
        )
      )
    },
    []
  )

  const loadProgress = useCallback(async studentId => {
    progressId.current = studentId

    const { data: next } = await api.get(
      `/faculty-portal/students/${studentId}/progress`
    )

    if (progressId.current === studentId) {
      setProgress(next)
    }
  }, [])

  const refresh = useCallback(async () => {
    const version = ++dataVersion.current

    const [dashboard, personal, requests] = await Promise.all([
      api.get('/faculty-portal/dashboard'),
      api.get('/profile/me', { role: 'faculty' }),
      api.get('/faculty-portal/publish-requests')
    ])

    if (version !== dataVersion.current) return

    const next = {
      ...dashboard.data,
      profile: {
        ...dashboard.data.profile,
        ...personal.data
      }
    }

    setPublishRequests(requests.data)
    setData(next)

    const selectedExam = rosterId.current

    if (selectedExam !== null) {
      if (
        next.exams.some(item =>
          item.exam_id === selectedExam
        )
      ) {
        await loadRoster(selectedExam, true)
      } else {
        rosterId.current = null
        dirtyRows.current.clear()
        setRoster(null)
      }
    }

    const selectedStudent = progressId.current

    if (selectedStudent !== null) {
      if (
        next.students.some(item =>
          item.student_id === selectedStudent
        )
      ) {
        const response = await api.get(
          `/faculty-portal/students/${selectedStudent}/progress`
        )

        if (progressId.current === selectedStudent) {
          setProgress(response.data)
        }
      } else {
        progressId.current = null
        setProgress(null)
      }
    }
  }, [loadRoster])

  useEffect(() => {
    refresh().catch(e => setError(e.message))
  }, [refresh])

  useLiveUpdates(async () => {
    if (!busyRef.current) {
      await refresh()
    }
  })

  useEffect(() => {
    const warn = event => {
      if (dirtyRows.current.size) {
        event.preventDefault()
        event.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', warn)

    return () => {
      window.removeEventListener('beforeunload', warn)
    }
  }, [])

  async function act(fn) {
    busyRef.current = true
    dataVersion.current++
    rosterVersion.current++

    setBusy(true)
    setError('')

    try {
      await fn()
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  if (!data) {
    return (
      <div style={{ padding: '2rem' }}>
        {error ? (
          <>
            <p role="alert">{error}</p>

            <button
              onClick={() =>
                refresh().catch(e => setError(e.message))
              }
            >
              Retry
            </button>
          </>
        ) : (
          <div className="spinner" />
        )}
      </div>
    )
  }

  const mine = data.courses.filter(
    course => course.is_mine
  )

  const available = data.courses.filter(
    course => !course.is_mine
  )

  const upcoming = data.exams
    .filter(item =>
      item.exam_date &&
      String(item.exam_date).slice(0, 10) >=
        new Date().toISOString().slice(0, 10)
    )
    .sort((a, b) =>
      String(a.exam_date).localeCompare(
        String(b.exam_date)
      )
    )

  const editExam = event => {
    setExam(old => ({
      ...old,
      [event.target.name]: event.target.value
    }))
  }

  const awaitingAdmin = examId =>
    publishRequests.some(
      request =>
        request.exam_id === examId &&
        request.status === 'pending'
    )

  // Course info for the exam currently open in the Marks section.
  const openExamMeta = roster
    ? data.exams.find(
        item => item.exam_id === roster.exam.exam_id
      )
    : null

  // Save every edited row of the open exam's Marks table.
  const saveAllMarks = () => {
    if (!roster?.exam.can_edit) return

    setMessage('')

    act(async () => {
      let saved = 0

      for (const enrollmentId of [...dirtyRows.current]) {
        const student = roster.students.find(
          row => row.enrollment_id === enrollmentId
        )

        if (
          !student ||
          !['enrolled', 'completed'].includes(student.status)
        ) {
          continue
        }

        const row = drafts[enrollmentId] || {}

        await api.put(
          `/faculty-portal/exams/${roster.exam.exam_id}/results/${enrollmentId}`,
          {
            obtained_marks:
              row.obtained_marks === ''
                ? null
                : row.obtained_marks,

            remarks: row.remarks
          }
        )

        dirtyRows.current.delete(enrollmentId)
        saved++
      }

      setMessage(
        saved
          ? `Marks saved for ${saved} student(s).`
          : 'No unsaved marks to save.'
      )
    })
  }

  // Request publication for the ENTIRE exam. After the admin
  // accepts, every student's result is published together and
  // blank marks are recorded as 0.
  const requestPublish = () => {
    if (!roster) return

    setMessage('')

    act(async () => {
      await api.post(
        `/faculty-portal/exams/${roster.exam.exam_id}/publish-requests`,
        {}
      )

      setMessage(
        'Publish request sent to the administrator. All students’ marks will publish together after approval.'
      )
    })
  }

  return (
    <div style={{
      maxWidth: 1250,
      margin: '0 auto',
      padding: '2rem'
    }}>
      <header className="page-header">
        <div style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center'
        }}>
          <ProfileAvatar
            src={data.profile.profile_photo}
            name={data.profile.full_name}
            size={60}
          />

          <div>
            <h1 className="page-title">
              Faculty dashboard
            </h1>

            <p>
              {data.profile.full_name}
              {' · '}
              {data.profile.designation}
              {' · '}
              {data.profile.department_name}
            </p>

            {data.profile.bengali_name && (
              <p lang="bn">
                {data.profile.bengali_name}
              </p>
            )}
          </div>
        </div>

        <button
          className="btn btn-secondary"
          onClick={() => {
            logout()
            navigate('/faculty-login')
          }}
        >
          Log out
        </button>
      </header>

      <nav style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 20
      }}>
        {[
          'overview',
          'courses',
          'students',
          'exams',
          'profile'
        ].map(name => (
          <button
            key={name}
            className={`btn ${
              tab === name
                ? 'btn-primary'
                : 'btn-secondary'
            }`}
            disabled={busy}
            onClick={() => setTab(name)}
          >
            {name[0].toUpperCase() + name.slice(1)}
          </button>
        ))}
      </nav>

      {error && (
        <p
          className="badge badge-danger"
          role="alert"
          style={{
            display: 'block',
            marginBottom: 16
          }}
        >
          {error}
        </p>
      )}

      {message && (
        <p
          className="badge badge-success"
          role="status"
          style={{
            display: 'block',
            marginBottom: 16
          }}
        >
          {message}
        </p>
      )}

      {tab === 'overview' && (
        <>
          <div className="stats-grid">
            {[
              ['My courses', mine.length],
              ['Students under supervision', data.students.length],
              ['My exams', data.exams.length],
              [
                'Pending publish requests',
                publishRequests.filter(
                  item => item.status === 'pending'
                ).length
              ]
            ].map(([label, value]) => (
              <div className="stat-card" key={label}>
                <div className="stat-value">{value}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <h2>Upcoming exams</h2>

            {upcoming.length ? upcoming.map(item => (
              <p key={item.exam_id}>
                {calendarDate(item.exam_date)}
                {' · '}
                {item.course_code}
                {' · '}
                {item.exam_type}
              </p>
            )) : (
              <p>No upcoming exams.</p>
            )}
          </div>

          <div className="card">
            <h2>Office hours</h2>
            <p>{data.profile.office_hours || 'Not set'}</p>
            <p>
              {data.profile.office_location ||
                'Office location not set'}
            </p>
          </div>
        </>
      )}

      {tab === 'courses' && (
        <>
          <div className="card">
            <h2>My teaching assignments</h2>

            <p>
              Removing an assignment does not delete the
              course, students, exams or results.
            </p>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Credits</th>
                    <th>Program</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {mine.map(course => (
                    <tr key={course.course_id}>
                      <td>
                        {course.course_code}
                        {' — '}
                        {course.course_title}
                        {!course.active && ' (inactive)'}
                      </td>

                      <td>{course.credit_hours}</td>
                      <td>{course.program_name}</td>

                      <td>
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(
                              'Remove your teaching assignment? Academic records will be kept.'
                            )) {
                              act(() =>
                                api.delete(
                                  `/faculty-portal/courses/${course.course_id}`
                                )
                              )
                            }
                          }}
                        >
                          Remove assignment
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!mine.length && <p>No courses assigned.</p>}
          </div>

          <div className="card">
            <h2>Available courses in my department</h2>

            <p>
              You can add any active course in your
              department, even if another teacher already
              teaches it.
            </p>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Program</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {available.map(course => (
                    <tr key={course.course_id}>
                      <td>
                        {course.course_code}
                        {' — '}
                        {course.course_title}
                      </td>

                      <td>{course.program_name}</td>

                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() => act(() =>
                            api.post(
                              `/faculty-portal/courses/${course.course_id}`
                            )
                          )}
                        >
                          Add to my courses
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!available.length && (
              <p>
                No other courses are available in your department.
              </p>
            )}
          </div>
        </>
      )}

      {tab === 'students' && (
        <>
          <div className="card table-container">
            <h2>My students and advisees</h2>

            <table>
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Name</th>
                  <th>Program</th>
                  <th>CGPA</th>
                  <th>Relationship</th>
                  <th>Progress</th>
                </tr>
              </thead>

              <tbody>
                {data.students.map(student => (
                  <tr key={student.student_id}>
                    <td>{student.registration_no}</td>
                    <td>{student.full_name}</td>
                    <td>{student.program_name}</td>

                    <td>
                      {Number(student.current_cgpa).toFixed(2)}
                    </td>

                    <td>
                      {student.is_advisee
                        ? 'Academic advisee'
                        : 'Course student'}
                    </td>

                    <td>
                      <button
                        className="btn btn-sm btn-secondary"
                        disabled={busy}
                        onClick={() => act(() =>
                          loadProgress(student.student_id)
                        )}
                      >
                        View progress
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!data.students.length && (
              <p>No students currently under your supervision.</p>
            )}
          </div>

          {progress && (
            <div className="card">
              <h2>
                {progress.student.full_name}
                {' — academic progress'}
              </h2>

              <p>
                Stored CGPA:
                {' '}
                {Number(
                  progress.student.current_cgpa
                ).toFixed(2)}.
                {' '}
                Course-student access is limited to your courses;
                advisors can see published academic results
                across courses.
              </p>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Year / term</th>
                      <th>Enrollment</th>
                    </tr>
                  </thead>

                  <tbody>
                    {progress.enrollments.map(enrollment => (
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

                        <td>{enrollment.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Exam</th>
                      <th>Marks</th>
                      <th>Grade</th>
                    </tr>
                  </thead>

                  <tbody>
                    {progress.results.map(result => (
                      <tr key={result.exam_id}>
                        <td>{result.course_code}</td>
                        <td>{result.exam_type}</td>
                        <td>{marksText(result)}</td>
                        <td>{result.grade || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!progress.results.length && (
                <p>No accessible results yet.</p>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'exams' && (
        <>
          <form
            className="card"
            onSubmit={event => {
              event.preventDefault()

              act(async () => {
                const { data: created } = await api.post(
                  '/faculty-portal/exams',
                  exam
                )

                await loadRoster(created.exam_id)
              })
            }}
          >
            <h2>Create a shared exam</h2>

            <p>
              Use the same academic year and term as the
              students’ enrollments.
            </p>

            <div className="form-row">
              <label className="form-group">
                Course

                <select
                  className="form-select"
                  name="course_id"
                  value={exam.course_id}
                  onChange={editExam}
                  required
                >
                  <option value="">
                    Select your course
                  </option>

                  {mine
                    .filter(course => course.active)
                    .map(course => (
                      <option
                        key={course.course_id}
                        value={course.course_id}
                      >
                        {course.course_code}
                      </option>
                    ))}
                </select>
              </label>

              <label className="form-group">
                Academic year

                <input
                  className="form-input"
                  name="academic_year"
                  maxLength={20}
                  value={exam.academic_year}
                  onChange={editExam}
                  required
                />
              </label>

              <label className="form-group">
                Term

                <select
                  className="form-select"
                  name="term"
                  value={exam.term}
                  onChange={editExam}
                >
                  {['Fall', 'Spring', 'Summer'].map(term => (
                    <option key={term}>{term}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-row">
              <label className="form-group">
                Exam type / name

                <input
                  className="form-input"
                  name="exam_type"
                  maxLength={50}
                  value={exam.exam_type}
                  onChange={editExam}
                  required
                />
              </label>

              <label className="form-group">
                Date

                <input
                  className="form-input"
                  name="exam_date"
                  type="date"
                  value={exam.exam_date}
                  onChange={editExam}
                  required
                />
              </label>

              <label className="form-group">
                Total marks

                <input
                  className="form-input"
                  name="total_marks"
                  type="number"
                  min="0.01"
                  max="9999.99"
                  step="0.01"
                  value={exam.total_marks}
                  onChange={editExam}
                  required
                />
              </label>
            </div>

            <button
              className="btn btn-primary"
              disabled={
                busy ||
                !mine.some(course => course.active)
              }
            >
              Create draft exam
            </button>
          </form>

          <div className="card table-container">
            <h2>My exams</h2>

            <table>
              <thead>
                <tr>
                  <th>Course / exam</th>
                  <th>Year / term</th>
                  <th>Date</th>
                  <th>Grading</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {data.exams.map(item => (
                  <tr key={item.exam_id}>
                    <td>
                      {item.course_code}
                      {' — '}
                      {item.exam_type}
                    </td>

                    <td>
                      {item.academic_year} / {item.term}
                    </td>

                    <td>{calendarDate(item.exam_date)}</td>
                    <td>{item.graded_count} graded</td>

                    <td>
                      {item.published
                        ? 'Published'
                        : 'Draft'}

                      {awaitingAdmin(item.exam_id) &&
                        ' · awaiting admin'}

                      {!item.can_edit && ' · Read-only'}
                    </td>

                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={() => {
                          setMessage('')
                          act(() => loadRoster(item.exam_id))
                        }}
                      >
                        Open marks
                      </button>
                      {' '}

                      {!item.published &&
                        item.graded_count === 0 && (
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={busy || !item.can_edit}
                            onClick={() => {
                              if (window.confirm(
                                'Delete this ungraded draft exam?'
                              )) {
                                act(async () => {
                                  await api.delete(
                                    `/faculty-portal/exams/${item.exam_id}`
                                  )

                                  if (
                                    rosterId.current === item.exam_id
                                  ) {
                                    rosterId.current = null
                                    setRoster(null)
                                    dirtyRows.current.clear()
                                  }
                                })
                              }
                            }}
                          >
                            Delete draft
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {roster && (
            <div className="card table-container">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  flexWrap: 'wrap',
                  marginBottom: 8
                }}
              >
                <div>
                  <h2 style={{ margin: 0 }}>
                    Marks — {openExamMeta?.course_code}
                    {' '}
                    {roster.exam.exam_type}
                  </h2>

                  <p style={{ margin: '4px 0 0' }}>
                    {roster.exam.academic_year}
                    {' / '}
                    {roster.exam.term}
                    {' · out of '}
                    {roster.exam.total_marks}
                    {' · '}
                    {roster.students.length}
                    {' enrolled student(s)'}
                  </p>
                </div>

                <span
                  className={`badge badge-${
                    roster.exam.published
                      ? 'success'
                      : awaitingAdmin(roster.exam.exam_id)
                        ? 'warning'
                        : 'secondary'
                  }`}
                >
                  {roster.exam.published
                    ? 'Published'
                    : awaitingAdmin(roster.exam.exam_id)
                      ? 'Awaiting admin approval'
                      : 'Draft'}
                </span>
              </div>

              <p>
                Enter marks for every enrolled student below, then
                save (per row or all at once). Blank marks stay
                ungraded until the exam is published, when they
                are recorded as 0. Request Publish sends this
                entire exam to the admin — every student’s result
                is published together after approval.
              </p>

              {!roster.exam.can_edit && (
                <p>
                  Read-only: you are not assigned to this active
                  course. Any unsaved drafts have not been recorded.
                </p>
              )}

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 12
                }}
              >
                <button
                  className="btn btn-secondary"
                  disabled={
                    busy ||
                    !roster.exam.can_edit ||
                    dirtyRows.current.size === 0
                  }
                  onClick={saveAllMarks}
                >
                  Save all marks
                </button>

                <button
                  className="btn btn-primary"
                  disabled={
                    busy ||
                    roster.exam.published ||
                    awaitingAdmin(roster.exam.exam_id)
                  }
                  onClick={requestPublish}
                >
                  {roster.exam.published
                    ? 'Published'
                    : awaitingAdmin(roster.exam.exam_id)
                      ? 'Awaiting admin approval'
                      : 'Request Publish'}
                </button>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Enrollment</th>
                    <th>Marks</th>
                    <th>Remarks</th>
                    <th>Save</th>
                  </tr>
                </thead>

                <tbody>
                  {roster.students.map(student => {
                    const row =
                      drafts[student.enrollment_id] || {}

                    const editable =
                      roster.exam.can_edit &&
                      ['enrolled', 'completed'].includes(
                        student.status
                      )

                    const edit = (field, value) => {
                      dirtyRows.current.add(
                        student.enrollment_id
                      )

                      setDrafts(old => ({
                        ...old,

                        [student.enrollment_id]: {
                          ...old[student.enrollment_id],
                          [field]: value
                        }
                      }))
                    }

                    return (
                      <tr key={student.enrollment_id}>
                        <td>
                          {student.registration_no}
                          {' — '}
                          {student.full_name}
                        </td>

                        <td>
                          <span className={`badge badge-${
                            ['enrolled', 'completed'].includes(
                              student.status
                            )
                              ? 'success'
                              : student.status === 'dropped'
                                ? 'danger'
                                : 'secondary'
                          }`}>
                            {student.status}
                          </span>
                        </td>

                        <td>
                          <input
                            aria-label={
                              `Marks for ${student.full_name}`
                            }
                            className="form-input"
                            type="number"
                            min="0"
                            step="0.01"
                            max={roster.exam.total_marks}
                            value={row.obtained_marks ?? ''}
                            disabled={busy || !editable}
                            onChange={event =>
                              edit(
                                'obtained_marks',
                                event.target.value
                              )
                            }
                          />
                        </td>

                        <td>
                          <input
                            aria-label={
                              `Remarks for ${student.full_name}`
                            }
                            className="form-input"
                            maxLength={2000}
                            value={row.remarks || ''}
                            disabled={busy || !editable}
                            onChange={event =>
                              edit(
                                'remarks',
                                event.target.value
                              )
                            }
                          />
                        </td>

                        <td>
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={busy || !editable}
                            onClick={() => act(async () => {
                              const { data: saved } =
                                await api.put(
                                  `/faculty-portal/exams/${roster.exam.exam_id}/results/${student.enrollment_id}`,
                                  {
                                    obtained_marks:
                                      row.obtained_marks === ''
                                        ? null
                                        : row.obtained_marks,

                                    remarks: row.remarks
                                  }
                                )

                              dirtyRows.current.delete(
                                student.enrollment_id
                              )

                              setDrafts(old => ({
                                ...old,

                                [student.enrollment_id]: {
                                  obtained_marks:
                                    saved.obtained_marks ?? '',

                                  remarks:
                                    saved.remarks || ''
                                }
                              }))

                              setRoster(old => ({
                                ...old,
                                students: old.students.map(
                                  person =>
                                    person.enrollment_id ===
                                      student.enrollment_id
                                      ? { ...person, ...saved }
                                      : person
                                )
                              }))
                            })}
                          >
                            Save
                          </button>

                          {dirtyRows.current.has(
                            student.enrollment_id
                          ) && (
                            <small> Unsaved</small>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {!roster.students.length && (
                <p>
                  No students are enrolled for this
                  course/year/term.
                </p>
              )}
            </div>
          )}

          <div className="card table-container">
            <h2>My publish requests</h2>

            <p>
              One request covers a whole exam. After the admin
              accepts, every student’s result for that exam is
              published together.
            </p>

            <table>
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Year / term</th>
                  <th>Requested</th>
                  <th>Status</th>
                  <th>Reviewed</th>
                </tr>
              </thead>

              <tbody>
                {publishRequests.map(request => (
                  <tr key={request.request_id}>
                    <td>
                      {request.course_code}
                      {' — '}
                      {request.exam_type}
                    </td>

                    <td>
                      {request.academic_year} / {request.term}
                    </td>

                    <td>
                      {new Date(
                        request.requested_on
                      ).toLocaleString()}
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
                      {request.reviewed_on
                        ? new Date(
                            request.reviewed_on
                          ).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!publishRequests.length && (
              <p>No publish requests yet.</p>
            )}
          </div>
        </>
      )}

      <div hidden={tab !== 'profile'}>
        <ProfileEditor
          role="faculty"
          profile={data.profile}
          onSaved={personal =>
            setData(old => ({
              ...old,
              profile: {
                ...old.profile,
                ...personal
              }
            }))
          }
        />
      </div>
    </div>
  )
}