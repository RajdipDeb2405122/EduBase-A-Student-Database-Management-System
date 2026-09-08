import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'

import api from '../api'
import useLiveUpdates from '../hooks/useLiveUpdates'
import useViewState from '../hooks/useViewState'

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
    setBusy(request.request_id)
    setError('')
    setMessage('')

    try {
      const body = action === 'reject'
        ? {
            rejection_reason:
              reasons[request.request_id]?.trim() ||
              'No reason provided'
          }
        : {}

      await api.put(
        `/course-registration/${request.request_id}/${action}`,
        body
      )

      setMessage(
        action === 'approve'
          ? 'Approved. The student’s enrollment updates automatically.'
          : 'Rejected. The student can see the decision and reason.'
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
          Course Registration Requests
        </h1>

        <select
          className="form-select"
          aria-label="Request status"
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
          {requests.length} request(s) waiting for approval
          {' — live updates enabled.'}
        </p>
      )}

      <div className="card table-container">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Reg No</th>
              <th>Course</th>
              <th>Credits</th>
              <th>Year/Term</th>
              <th>Requested</th>
              <th>Review</th>
            </tr>
          </thead>

          <tbody>
            {requests.map(request => (
              <tr key={request.request_id}>
                <td>
                  {request.student_name}
                  <br />
                  <small>{request.student_email}</small>
                </td>

                <td>{request.registration_no}</td>

                <td>
                  {request.course_code}
                  <br />
                  <small>{request.course_title}</small>
                </td>

                <td>{request.credit_hours}</td>

                <td>
                  {request.academic_year} / {request.term}
                </td>

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
                          `Rejection reason for request ${request.request_id}`
                        }
                        value={
                          reasons[request.request_id] || ''
                        }
                        disabled={busy !== null}
                        onChange={e =>
                          setReasons(old => ({
                            ...old,
                            [request.request_id]:
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
                        Approve
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
                    request.rejection_reason ||
                    `Reviewed by ${request.reviewed_by_name || 'Admin'}`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!requests.length && (
          <p className="empty-state">
            No requests found
          </p>
        )}
      </div>
    </div>
  )
}