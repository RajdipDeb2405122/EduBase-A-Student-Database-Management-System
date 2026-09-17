import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'

import api from '../api'
import useLiveUpdates from '../hooks/useLiveUpdates'

const year = () =>
  `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`

const freshForm = () => ({
  student_id: '',
  course_id: '',
  academic_year: year(),
  term: 'Fall',
  enrolled_on: new Date().toISOString().slice(0, 10)
})

const statusName = value =>
  value === 'pending_payment'
    ? 'Pending Payment'
    : value

export default function Enrollments() {
  const [rows, setRows] = useState([])
  const [students, setStudents] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(freshForm)

  const version = useRef(0)

  const load = useCallback(async () => {
    const current = ++version.current

    try {
      const [enrolled, people, catalogue] =
        await Promise.all([
          api.get('/enrollments'),
          api.get('/students'),
          api.get('/courses')
        ])

      if (current !== version.current) return

      setRows(enrolled.data)
      setStudents(people.data)
      setCourses(catalogue.data)
    } catch (error) {
      if (current === version.current) {
        setError(error.message)
      }
    } finally {
      if (current === version.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useLiveUpdates(load)

  async function authorize(event) {
    event.preventDefault()

    setBusy(true)
    setError('')
    setMessage('')

    try {
      await api.post('/enrollments', form)

      setShowModal(false)
      setForm(freshForm())

      setMessage(
        'Course authorized. The student must pay the ৳1000 course fee before becoming enrolled.'
      )

      await load()
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="spinner" />
  }

  const filtered = rows.filter(enrollment =>
    [
      enrollment.student_name,
      enrollment.registration_no,
      enrollment.course_code,
      enrollment.academic_year,
      enrollment.status
    ].some(value =>
      String(value || '')
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  )

  const selectedStudent = students.find(
    student =>
      student.student_id === Number(form.student_id)
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Enrollments</h1>

        <button
          className="btn btn-primary"
          onClick={() => {
            setForm(freshForm())
            setError('')
            setShowModal(true)
          }}
        >
          Authorize course
        </button>
      </div>

      <p>
        New approvals remain Pending Payment until the student
        pays. Historical enrollments are preserved without a
        new fee.
      </p>

      {error && (
        <p role="alert" className="badge badge-danger">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="badge badge-success">
          {message}
        </p>
      )}

      <div className="card">
        <input
          className="form-input"
          placeholder="Search student, course or year…"
          aria-label="Search enrollments"
          value={search}
          onChange={event =>
            setSearch(event.target.value)
          }
        />

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Registration</th>
                <th>Course</th>
                <th>Year / term</th>
                <th>Enrollment status</th>
                <th>Course fee</th>
                <th>Authorized by</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(enrollment => (
                <tr key={enrollment.enrollment_id}>
                  <td>{enrollment.student_name}</td>
                  <td>{enrollment.registration_no}</td>

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
                    <span className={`badge badge-${
                      enrollment.status === 'pending_payment'
                        ? 'warning'
                        : enrollment.status === 'dropped'
                          ? 'danger'
                          : 'success'
                    }`}>
                      {statusName(enrollment.status)}
                    </span>
                  </td>

                  <td>
                    {!enrollment.fee_required
                      ? 'Existing enrollment — no new fee'
                      : enrollment.payment_status === 'paid'
                        ? '৳1,000 paid'
                        : enrollment.payment_status === 'cancelled'
                          ? 'Cancelled / dropped'
                          : '৳1,000 pending'}
                  </td>

                  <td>
                    {enrollment.authorized_by_name || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!filtered.length && (
          <p className="empty-state">
            No enrollments found.
          </p>
        )}
      </div>

      {showModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!busy) setShowModal(false)
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={event => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">
                Authorize course — payment required
              </h2>
            </div>

            <form onSubmit={authorize}>
              <div className="modal-body">
                <p>
                  This does not create a payment or bypass
                  the student’s fee.
                </p>

                <label className="form-group">
                  Student

                  <select
                    className="form-select"
                    required
                    value={form.student_id}
                    onChange={event =>
                      setForm(old => ({
                        ...old,
                        student_id: event.target.value,
                        course_id: ''
                      }))
                    }
                  >
                    <option value="">Select student</option>

                    {students
                      .filter(student =>
                        student.current_status === 'active'
                      )
                      .map(student => (
                        <option
                          key={student.student_id}
                          value={student.student_id}
                        >
                          {student.registration_no}
                          {' — '}
                          {student.full_name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="form-group">
                  Course

                  <select
                    className="form-select"
                    required
                    value={form.course_id}
                    onChange={event =>
                      setForm(old => ({
                        ...old,
                        course_id: event.target.value
                      }))
                    }
                  >
                    <option value="">Select course</option>

                    {courses
                      .filter(course =>
                        course.active &&
                        course.program_id ===
                          selectedStudent?.program_id
                      )
                      .map(course => (
                        <option
                          key={course.course_id}
                          value={course.course_id}
                        >
                          {course.course_code}
                          {' — '}
                          {course.course_title}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="form-group">
                  Academic year

                  <input
                    className="form-input"
                    required
                    maxLength={20}
                    value={form.academic_year}
                    onChange={event =>
                      setForm(old => ({
                        ...old,
                        academic_year: event.target.value
                      }))
                    }
                  />
                </label>

                <label className="form-group">
                  Term

                  <select
                    className="form-select"
                    value={form.term}
                    onChange={event =>
                      setForm(old => ({
                        ...old,
                        term: event.target.value
                      }))
                    }
                  >
                    {['Fall', 'Spring', 'Summer'].map(term => (
                      <option key={term}>{term}</option>
                    ))}
                  </select>
                </label>

                <label className="form-group">
                  Authorization date

                  <input
                    className="form-input"
                    type="date"
                    value={form.enrolled_on}
                    onChange={event =>
                      setForm(old => ({
                        ...old,
                        enrolled_on: event.target.value
                      }))
                    }
                  />
                </label>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>

                <button
                  className="btn btn-primary"
                  disabled={busy}
                >
                  {busy
                    ? 'Saving…'
                    : 'Authorize — student must pay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}