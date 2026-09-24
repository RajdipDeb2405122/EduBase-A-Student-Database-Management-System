import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'

import api from '../api'
import useLiveUpdates from '../hooks/useLiveUpdates'
import useViewState from '../hooks/useViewState'

const outcome = registration =>
  registration.status === 'approved'
    ? registration.complete
      ? 'Complete — all courses enrolled'
      : `Approved — ${registration.active_count} of ${registration.courses.length} fees paid`
    : registration.rejection_reason ||
      `Reviewed by ${registration.reviewed_by_name || 'Admin'}`

export default function CourseRegistrationRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const [view, setView] = useViewState(
    'edubase_admin_course_requests',
    { filter: 'pending' }
  )

  const filter = view.filter

  const [reasons, setReasons] = useState({})
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const version = useRef(0)

  const loadRequests = useCallback(async () => {
    const current = ++version.current

    try {
      const { data } = await api.get(
        `/course-registration?status=${filter}`
      )

      if (current === version.current) {
        setRequests(data)
      }
    } catch (e) {
      if (current === version.current) {
        setError(e.message)
      }
    } finally {
      if (current === version.current) {
        setLoading(false)
      }
    }
  }, [filter])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  useLiveUpdates(loadRequests)

  async function review(request, action) {
    setBusy(request.registration_id)
    setError('')
    setMessage('')

    try {
      const body = action === 'reject'
        ? {
            rejection_reason:
              reasons[request.registration_id]?.trim() ||
              'No reason provided'
          }
        : {}

      await api.put(
        `/course-registration/${request.registration_id}/${action}`,
        body
      )

      setMessage(
        action === 'approve'
          ? 'Approved. The student now sees Pending Payment for every course and must pay each ৳1000 course fee.'
          : 'Rejected. The student can see the decision and reason, and may submit again.'
      )

      await loadRequests()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <div className="spinner" />
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          Term Registrations
        </h1>

        <select
          className="form-select"
          aria-label="Registration status"
          style={{ width: 200 }}
          value={filter}
          disabled={busy !== null}
          onChange={e =>
            setView({ filter: e.target.value })
          }
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <p>
        Each request covers every course of the student’s current
        term. Approving creates all of the enrollments at once.
      </p>

      {error && (
        <p className="badge badge-danger" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="badge badge-success" role="status">
          {message}
        </p>
      )}

      {filter === 'pending' && (
        <p>
          {requests.length} registration(s) waiting for approval
          {' — live updates enabled.'}
        </p>
      )}

      <div className="card table-container">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Reg No</th>
              <th>Term</th>
              <th>Courses</th>
              <th>Year</th>
              <th>Requested</th>
              <th>Review</th>
            </tr>
          </thead>

          <tbody>
            {requests.map(request => (
              <tr key={request.registration_id}>
                <td>
                  {request.student_name}
                  <br />
                  <small>{request.student_email}</small>
                </td>

                <td>{request.registration_no}</td>

                <td>
                  {request.department_code}
                  {' '}
                  {request.level}-{request.term}
                </td>

                <td>
                  {request.courses.map(course => (
                    <div key={course.course_id}>
                      <small>
                        {course.course_code}
                        {course.enrollment_status &&
                          ` — ${course.enrollment_status === 'pending_payment'
                            ? 'fee pending'
                            : course.enrollment_status}`}
                      </small>
                    </div>
                  ))}
                </td>

                <td>{request.academic_year}</td>

                <td>
                  {new Date(
                    request.requested_on
                  ).toLocaleDateString()}
                </td>

                <td>
                  {filter === 'pending' ? (
                    <>
                      <input
                        className="form-input"
                        placeholder="Reason if rejecting"
                        maxLength={1000}
                        aria-label={
                          `Rejection reason for registration ${request.registration_id}`
                        }
                        value={
                          reasons[request.registration_id] || ''
                        }
                        disabled={busy !== null}
                        onChange={e =>
                          setReasons(old => ({
                            ...old,
                            [request.registration_id]:
                              e.target.value
                          }))
                        }
                      />

                      <button
                        className="btn btn-sm btn-primary"
                        disabled={busy !== null}
                        onClick={() =>
                          review(request, 'approve')
                        }
                      >
                        Approve all
                      </button>
                      {' '}

                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busy !== null}
                        onClick={() =>
                          review(request, 'reject')
                        }
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    outcome(request)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!requests.length && (
          <p className="empty-state">
            No registrations found
          </p>
        )}
      </div>
    </div>
  )
}
