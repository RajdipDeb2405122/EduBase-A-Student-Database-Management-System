import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'

const calendarDate = value =>
  value ? String(value).slice(0, 10) : 'Not scheduled'

const marksText = row =>
  `${row.obtained_marks ?? 'Not graded'} / ${row.total_marks}`

export default function FacultyDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [tab, setTab] = useState('overview')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [roster, setRoster] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [progress, setProgress] = useState(null)

  const [profile, setProfile] = useState({
    phone: '',
    office_location: '',
    office_hours: ''
  })

  const year = new Date().getFullYear()

  const [exam, setExam] = useState({
    course_id: '',
    academic_year: `${year}-${year + 1}`,
    term: 'Fall',
    exam_type: 'Midterm',
    exam_date: '',
    total_marks: '100'
  })

  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirm: ''
  })

  const refresh = useCallback(async () => {
    const { data: next } =
      await api.get('/faculty-portal/dashboard')

    setData(next)

    setProfile({
      phone: next.profile.phone || '',
      office_location: next.profile.office_location || '',
      office_hours: next.profile.office_hours || ''
    })
  }, [])

  useEffect(() => {
    refresh().catch(e => setError(e.message))
  }, [refresh])

  async function act(fn) {
    setBusy(true)
    setError('')

    try {
      await fn()
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function loadRoster(examId) {
    const { data: next } =
      await api.get(`/faculty-portal/exams/${examId}/roster`)

    setRoster(next)

    setDrafts(Object.fromEntries(
      next.students.map(s => [
        s.enrollment_id,
        {
          obtained_marks: s.obtained_marks ?? '',
          remarks: s.remarks || ''
        }
      ])
    ))
  }

  async function changePassword(event) {
    event.preventDefault()
    setError('')

    if (passwords.newPassword !== passwords.confirm) {
      return setError('Passwords do not match')
    }

    setBusy(true)

    try {
      await api.post('/auth/change-password', passwords)
      logout()
      navigate('/faculty-login', { replace: true })
    } catch (e) {
      setError(e.message)
    } finally {
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
    c => c.faculty_id === data.profile.faculty_id
  )

  const available = data.courses.filter(
    c => c.faculty_id === null
  )

  const upcoming = data.exams
    .filter(x =>
      x.exam_date &&
      String(x.exam_date).slice(0, 10) >=
        new Date().toISOString().slice(0, 10)
    )
    .sort((a, b) =>
      String(a.exam_date).localeCompare(String(b.exam_date))
    )

  const editExam = e => {
    setExam(old => ({
      ...old,
      [e.target.name]: e.target.value
    }))
  }

  return (
    <div style={{
      maxWidth: 1250,
      margin: '0 auto',
      padding: '2rem'
    }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Faculty dashboard</h1>
          <p>
            {data.profile.full_name}
            {' · '}
            {data.profile.designation}
            {' · '}
            {data.profile.department_name}
          </p>
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
              tab === name ? 'btn-primary' : 'btn-secondary'
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
          style={{ display: 'block', marginBottom: 16 }}
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
                data.exams.filter(x => !x.published).length
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

            {upcoming.length ? upcoming.map(x => (
              <p key={x.exam_id}>
                {calendarDate(x.exam_date)}
                {' · '}
                {x.course_code}
                {' · '}
                {x.exam_type}
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
              Removing an assignment does not delete the course,
              students, exams or results.
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
                  {mine.map(c => (
                    <tr key={c.course_id}>
                      <td>
                        {c.course_code} — {c.course_title}
                        {!c.active && ' (inactive)'}
                      </td>
                      <td>{c.credit_hours}</td>
                      <td>{c.program_name}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(
                              'Remove your teaching assignment? Academic records will be kept.'
                            )) {
                              act(async () => {
                                await api.delete(
                                  `/faculty-portal/courses/${c.course_id}`
                                )
                                setRoster(null)
                                setProgress(null)
                              })
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
                  {available.map(c => (
                    <tr key={c.course_id}>
                      <td>{c.course_code} — {c.course_title}</td>
                      <td>{c.program_name}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() => act(() =>
                            api.post(
                              `/faculty-portal/courses/${c.course_id}`
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
                {data.students.map(s => (
                  <tr key={s.student_id}>
                    <td>{s.registration_no}</td>
                    <td>{s.full_name}</td>
                    <td>{s.program_name}</td>
                    <td>{Number(s.current_cgpa).toFixed(2)}</td>
                    <td>
                      {s.is_advisee
                        ? 'Academic advisee'
                        : 'Course student'}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-secondary"
                        disabled={busy}
                        onClick={() => act(async () => {
                          setProgress((
                            await api.get(
                              `/faculty-portal/students/${s.student_id}/progress`
                            )
                          ).data)
                        })}
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
                {progress.student.full_name} — academic progress
              </h2>

              <p>
                Stored CGPA:
                {' '}
                {Number(progress.student.current_cgpa).toFixed(2)}.
                {' '}
                Course-student access is limited to your courses;
                advisors can see published academic results across
                courses.
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
                    {progress.enrollments.map(e => (
                      <tr key={e.enrollment_id}>
                        <td>{e.course_code} — {e.course_title}</td>
                        <td>{e.academic_year} / {e.term}</td>
                        <td>{e.status}</td>
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
                    {progress.results.map(r => (
                      <tr key={r.exam_id}>
                        <td>{r.course_code}</td>
                        <td>{r.exam_type}</td>
                        <td>{marksText(r)}</td>
                        <td>{r.grade || '—'}</td>
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
            onSubmit={e => {
              e.preventDefault()

              act(async () => {
                const { data: created } =
                  await api.post('/faculty-portal/exams', exam)

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
                  <option value="">Select your course</option>
                  {mine.filter(c => c.active).map(c => (
                    <option key={c.course_id} value={c.course_id}>
                      {c.course_code}
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
                  {['Fall', 'Spring', 'Summer'].map(t => (
                    <option key={t}>{t}</option>
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
              disabled={busy || !mine.some(c => c.active)}
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
                {data.exams.map(x => (
                  <tr key={x.exam_id}>
                    <td>{x.course_code} — {x.exam_type}</td>
                    <td>{x.academic_year} / {x.term}</td>
                    <td>{calendarDate(x.exam_date)}</td>
                    <td>{x.graded_count} graded</td>
                    <td>
                      {x.published ? 'Published' : 'Draft'}
                      {!x.can_edit && ' · Read-only'}
                    </td>

                    <td>
                      <button
                        className="btn btn-sm btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          act(() => loadRoster(x.exam_id))
                        }
                      >
                        Roster / marks
                      </button>
                      {' '}

                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy || !x.can_edit}
                        onClick={() => act(async () => {
                          await api.put(
                            `/faculty-portal/exams/${x.exam_id}/publication`,
                            { published: !x.published }
                          )

                          if (roster?.exam.exam_id === x.exam_id) {
                            await loadRoster(x.exam_id)
                          }
                        })}
                      >
                        {x.published ? 'Unpublish' : 'Publish'}
                      </button>
                      {' '}

                      {!x.published && x.graded_count === 0 && (
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={busy || !x.can_edit}
                          onClick={() => {
                            if (window.confirm(
                              'Delete this ungraded draft exam?'
                            )) {
                              act(async () => {
                                await api.delete(
                                  `/faculty-portal/exams/${x.exam_id}`
                                )

                                if (
                                  roster?.exam.exam_id === x.exam_id
                                ) {
                                  setRoster(null)
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
                  {roster.students.map(s => {
                    const row = drafts[s.enrollment_id] || {}

                    const editable =
                      roster.exam.can_edit &&
                      ['enrolled', 'completed'].includes(s.status)

                    const edit = (field, value) => {
                      setDrafts(old => ({
                        ...old,
                        [s.enrollment_id]: {
                          ...old[s.enrollment_id],
                          [field]: value
                        }
                      }))
                    }

                    return (
                      <tr key={s.enrollment_id}>
                        <td>
                          {s.registration_no} — {s.full_name}
                        </td>

                        <td>
                          <input
                            aria-label={`Marks for ${s.full_name}`}
                            className="form-input"
                            type="number"
                            min="0"
                            step="0.01"
                            max={roster.exam.total_marks}
                            value={row.obtained_marks ?? ''}
                            disabled={busy || !editable}
                            onChange={e =>
                              edit('obtained_marks', e.target.value)
                            }
                          />
                        </td>

                        <td>
                          <input
                            aria-label={`Remarks for ${s.full_name}`}
                            className="form-input"
                            maxLength={2000}
                            value={row.remarks || ''}
                            disabled={busy || !editable}
                            onChange={e =>
                              edit('remarks', e.target.value)
                            }
                          />
                        </td>

                        <td>
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={busy || !editable}
                            onClick={() => act(async () => {
                              const { data: saved } = await api.put(
                                `/faculty-portal/exams/${roster.exam.exam_id}/results/${s.enrollment_id}`,
                                {
                                  obtained_marks:
                                    row.obtained_marks === ''
                                      ? null
                                      : row.obtained_marks,
                                  remarks: row.remarks
                                }
                              )

                              // Keep other students' unsaved inputs.
                              setDrafts(old => ({
                                ...old,
                                [s.enrollment_id]: {
                                  obtained_marks:
                                    saved.obtained_marks ?? '',
                                  remarks: saved.remarks || ''
                                }
                              }))

                              setRoster(old => ({
                                ...old,
                                students: old.students.map(person =>
                                  person.enrollment_id ===
                                    s.enrollment_id
                                    ? { ...person, ...saved }
                                    : person
                                )
                              }))
                            })}
                          >
                            Save marks
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {!roster.students.length && (
                <p>
                  No students are enrolled for this course/year/term.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'profile' && (
        <>
          <form
            className="card"
            onSubmit={e => {
              e.preventDefault()

              act(() =>
                api.put('/faculty-portal/profile', profile)
              )
            }}
          >
            <h2>Contact and office hours</h2>
            <p>{data.profile.email}</p>

            {Object.entries({
              phone: 'Phone',
              office_location: 'Office location',
              office_hours: 'Office hours'
            }).map(([key, label]) => (
              <label
                className="form-group"
                style={{ display: 'block' }}
                key={key}
              >
                {label}
                <input
                  className="form-input"
                  value={profile[key]}
                  maxLength={
                    key === 'phone'
                      ? 20
                      : key === 'office_hours'
                        ? 200
                        : 100
                  }
                  onChange={e => setProfile(old => ({
                    ...old,
                    [key]: e.target.value
                  }))}
                />
              </label>
            ))}

            <button className="btn btn-primary" disabled={busy}>
              Save profile
            </button>
          </form>

          <form className="card" onSubmit={changePassword}>
            <h2>Change password</h2>

            {Object.entries({
              currentPassword: 'Current password',
              newPassword: 'New password',
              confirm: 'Confirm new password'
            }).map(([key, label]) => (
              <label
                className="form-group"
                style={{ display: 'block' }}
                key={key}
              >
                {label}
                <input
                  type="password"
                  className="form-input"
                  required
                  minLength={
                    key === 'currentPassword' ? undefined : 8
                  }
                  maxLength={72}
                  value={passwords[key]}
                  onChange={e => setPasswords(old => ({
                    ...old,
                    [key]: e.target.value
                  }))}
                />
              </label>
            ))}

            <button className="btn btn-primary" disabled={busy}>
              Change password and sign out
            </button>
          </form>
        </>
      )}
    </div>
  )
}