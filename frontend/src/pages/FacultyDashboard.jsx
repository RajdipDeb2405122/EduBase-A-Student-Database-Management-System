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
import CgpaValue from '../components/CgpaValue'

const termOf = course => `Level ${course.level}, Term ${course.term}`

const blank = value =>
  value === null || value === undefined ? '' : String(Number(value))

// Client-side hint only; the server validates every value.
function invalidValue(value, max) {
  if (value === '') return false
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return true
  return Number(value) > max
}

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
  const [sheet, setSheet] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [progress, setProgress] = useState(null)

  const dirtyRows = useRef(new Set())
  const busyRef = useRef(false)
  const sheetId = useRef(null)
  const progressId = useRef(null)
  const dataVersion = useRef(0)
  const sheetVersion = useRef(0)

  const loadSheet = useCallback(
    async (courseId, automatic = false) => {
      if (automatic && sheetId.current !== courseId) {
        return
      }

      if (!automatic && sheetId.current !== courseId) {
        if (
          dirtyRows.current.size &&
          !window.confirm(
            'Discard unsaved marks and open another course?'
          )
        ) {
          return
        }

        dirtyRows.current.clear()
        sheetId.current = courseId
      }

      const version = ++sheetVersion.current

      const { data: next } = await api.get(
        `/faculty-portal/courses/${courseId}/marks`
      )

      if (
        version !== sheetVersion.current ||
        sheetId.current !== courseId
      ) {
        return
      }

      setSheet(next)

      setDrafts(old =>
        Object.fromEntries(
          next.students.map(student => [
            student.enrollment_id,

            dirtyRows.current.has(student.enrollment_id) &&
            old[student.enrollment_id]
              ? old[student.enrollment_id]
              : Object.fromEntries(
                  next.components.map(component => [
                    component.key,
                    blank(student[component.key])
                  ])
                )
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

    const selectedCourse = sheetId.current

    if (selectedCourse !== null) {
      if (
        next.courses.some(item =>
          item.course_id === selectedCourse && item.is_mine
        )
      ) {
        await loadSheet(selectedCourse, true)
      } else {
        sheetId.current = null
        dirtyRows.current.clear()
        setSheet(null)
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
  }, [loadSheet])

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
    sheetVersion.current++

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

  const pendingMarks = mine.reduce(
    (sum, course) =>
      sum + course.student_count - course.marked_count,
    0
  )

  // Saves every edited row; untouched rows and blank boxes are
  // left as they are, so partial progress is fine.
  const saveMarks = () => {
    if (!sheet) return

    const rows = [...dirtyRows.current]
      .map(enrollmentId => {
        const student = sheet.students.find(
          row => row.enrollment_id === enrollmentId
        )

        if (!student || student.locked) return null

        return {
          enrollment_id: enrollmentId,
          registration_no: student.registration_no,
          ...drafts[enrollmentId]
        }
      })
      .filter(Boolean)

    setMessage('')

    if (!rows.length) {
      setMessage('No unsaved marks to save.')
      return
    }

    act(async () => {
      const { data: saved } = await api.put(
        `/faculty-portal/courses/${sheet.course.course_id}/marks`,
        { marks: rows }
      )

      dirtyRows.current.clear()
      setSheet(saved)

      setMessage(`Marks saved for ${saved.saved} student(s).`)
    })
  }

  const unsaved = dirtyRows.current.size

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
          'marks',
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
              ['Students with complete marks', mine.reduce((sum, course) => sum + course.marked_count, 0)],
              ['Marks still to enter', pendingMarks]
            ].map(([label, value]) => (
              <div className="stat-card" key={label}>
                <div className="stat-value">{value}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
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
              course, students, marks or results.
            </p>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Term</th>
                    <th>Credits</th>
                    <th>Marks entered</th>
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

                      <td>
                        {course.department_code} {termOf(course)}
                      </td>

                      <td>{course.credit_hours}</td>

                      <td>
                        {course.marked_count} / {course.student_count}
                      </td>

                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() => {
                            setTab('marks')
                            act(() => loadSheet(course.course_id))
                          }}
                        >
                          Enter marks
                        </button>
                        {' '}

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
                    <th>Term</th>
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

                      <td>{termOf(course)}</td>

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
                  <th>Term</th>
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
                      {student.current_level}-{student.current_term}
                    </td>

                    <td>
                      <CgpaValue
                        value={student.current_cgpa}
                        note={false}
                      />
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
                CGPA:
                {' '}
                <CgpaValue value={progress.student.current_cgpa} />.
                {' '}
                Course-student access is limited to your courses;
                advisors can see every course.
              </p>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Year / term</th>
                      <th>Enrollment</th>
                      {progress.components.map(component => (
                        <th key={component.key}>{component.label}</th>
                      ))}
                      <th>Total</th>
                      <th>Grade</th>
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

                        {progress.components.map(component => (
                          <td key={component.key}>
                            {blank(enrollment[component.key]) || '—'}
                          </td>
                        ))}

                        <td>{blank(enrollment.total) || '—'}</td>

                        <td>
                          {enrollment.letter_grade
                            ? `${enrollment.letter_grade} (${Number(enrollment.grade_point).toFixed(2)})`
                            : 'Not published'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!progress.enrollments.length && (
                <p>No accessible enrollments yet.</p>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'marks' && (
        <>
          <div className="card">
            <h2>Marks entry</h2>

            <p>
              Choose one of your courses. Each student has three
              components; the total is calculated automatically.
              You can save some students now and the rest later.
              Marks are locked once the admin publishes the result.
            </p>

            <label className="form-group">
              Course

              <select
                className="form-select"
                value={sheet?.course.course_id ?? ''}
                disabled={busy}
                onChange={event => {
                  const value = Number(event.target.value)
                  setMessage('')

                  if (value) {
                    act(() => loadSheet(value))
                  }
                }}
              >
                <option value="">Select your course</option>

                {mine.map(course => (
                  <option
                    key={course.course_id}
                    value={course.course_id}
                  >
                    {course.course_code}
                    {' — '}
                    {course.department_code} {course.level}-{course.term}
                    {' ('}
                    {course.marked_count}/{course.student_count}
                    {' complete)'}
                  </option>
                ))}
              </select>
            </label>

            {!mine.length && (
              <p>You have no assigned courses.</p>
            )}
          </div>

          {sheet && (
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
                    {sheet.course.course_code}
                    {' — '}
                    {sheet.course.course_title}
                  </h2>

                  <p style={{ margin: '4px 0 0' }}>
                    {sheet.course.department_code}
                    {' '}
                    {termOf(sheet.course)}
                    {' · '}
                    {sheet.students.length}
                    {' enrolled student(s) · '}
                    {sheet.students.filter(s => s.total !== null).length}
                    {' complete'}
                  </p>
                </div>

                {sheet.course.term_published && (
                  <span className="badge badge-success">
                    Result published
                  </span>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  marginBottom: 12
                }}
              >
                <button
                  className="btn btn-primary"
                  disabled={busy || unsaved === 0}
                  onClick={saveMarks}
                >
                  Save marks
                </button>

                {unsaved > 0 && (
                  <small>{unsaved} row(s) with unsaved changes</small>
                )}
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    {sheet.components.map(component => (
                      <th key={component.key}>
                        {component.label} (max {component.max})
                      </th>
                    ))}
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {sheet.students.map(student => {
                    const row = drafts[student.enrollment_id] || {}
                    const editable = !student.locked
                    const dirty = dirtyRows.current.has(student.enrollment_id)

                    const edit = (field, value) => {
                      dirtyRows.current.add(student.enrollment_id)

                      setDrafts(old => ({
                        ...old,

                        [student.enrollment_id]: {
                          ...old[student.enrollment_id],
                          [field]: value
                        }
                      }))
                    }

                    const filled = sheet.components.every(
                      component => row[component.key] !== ''
                    )

                    const preview = filled
                      ? sheet.components.reduce(
                          (sum, component) =>
                            sum + Number(row[component.key]),
                          0
                        )
                      : null

                    return (
                      <tr key={student.enrollment_id}>
                        <td>
                          {student.registration_no}
                          {' — '}
                          {student.full_name}
                        </td>

                        {sheet.components.map(component => {
                          const value = row[component.key] ?? ''
                          const invalid = invalidValue(value, component.max)

                          return (
                            <td key={component.key}>
                              <input
                                aria-label={
                                  `${component.label} for ${student.full_name}`
                                }
                                aria-invalid={invalid}
                                className="form-input"
                                style={{
                                  maxWidth: 110,
                                  ...(invalid && {
                                    borderColor: 'var(--danger)'
                                  })
                                }}
                                type="number"
                                inputMode="decimal"
                                min="0"
                                max={component.max}
                                step="0.01"
                                value={value}
                                disabled={busy || !editable}
                                onChange={event =>
                                  edit(component.key, event.target.value)
                                }
                              />
                            </td>
                          )
                        })}

                        <td>
                          {preview === null ? '—' : Number(preview.toFixed(2))}
                        </td>

                        <td>
                          {student.locked ? (
                            <span className="badge badge-success">
                              Published
                            </span>
                          ) : dirty ? (
                            <span className="badge badge-warning">
                              Unsaved
                            </span>
                          ) : student.total !== null ? (
                            <span className="badge badge-success">
                              Complete
                            </span>
                          ) : (
                            <span className="badge badge-secondary">
                              Incomplete
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {!sheet.students.length && (
                <p>
                  No students have completed registration and
                  payment for this course yet.
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
