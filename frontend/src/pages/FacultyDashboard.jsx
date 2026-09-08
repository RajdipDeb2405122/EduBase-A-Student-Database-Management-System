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
  const setTab = tab => setView({ tab })

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [roster, setRoster] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [progress, setProgress] = useState(null)

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

    const [dashboard, personal] = await Promise.all([
      api.get('/faculty-portal/dashboard'),
      api.get('/profile/me', { role: 'faculty' })
    ])

    if (version !== dataVersion.current) return

    const next = {
      ...dashboard.data,
      profile: {
        ...dashboard.data.profile,
        ...personal.data
      }
    }

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

  const mine = data.courses.filter(course =>
    course.faculty_id === data.profile.faculty_id
  )

  const available = data.courses.filter(course =>
    course.faculty_id === null
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

      {tab === 'overview' && (
        <>
          <div className="stats-grid">
            {[
              ['My courses', mine.length],
              ['Students under supervision', data.students.length],
              ['My exams', data.exams.length],
              [
                'Unpublished exams',
                data.exams.filter(item => !item.published).length
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
              <p>No unassigned courses are available.</p>
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
                      {item.published ? 'Published' : 'Draft'}
                      {!item.can_edit && ' · Read-only'}
                    </td>

                    <td>
                      <button
                        className="btn btn-sm btn-secondary"
                        disabled={busy}
                        onClick={() => act(() =>
                          loadRoster(item.exam_id)
                        )}
                      >
                        Roster / marks
                      </button>
                      {' '}

                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy || !item.can_edit}
                        onClick={() => act(async () => {
                          await api.put(
                            `/faculty-portal/exams/${item.exam_id}/publication`,
                            { published: !item.published }
                          )

                          if (
                            roster?.exam.exam_id === item.exam_id
                          ) {
                            await loadRoster(item.exam_id)
                          }
                        })}
                      >
                        {item.published ? 'Unpublish' : 'Publish'}
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
              <h2>
                {roster.exam.exam_type}
                {' — marks out of '}
                {roster.exam.total_marks}
              </h2>

              <p>
                Blank means not graded. Zero is a real score.
                Publish when results are ready for students.
              </p>

              {!roster.exam.can_edit && (
                <p>
                  Read-only: you are not assigned to this active
                  course. Any unsaved drafts have not been recorded.
                </p>
              )}

              <table>
                <thead>
                  <tr>
                    <th>Student</th>
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
                            Save marks
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