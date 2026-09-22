import { useState, useEffect } from 'react'
import api from '../api'
import useLiveUpdates from '../hooks/useLiveUpdates'

const Exams = () => {
  const [exams, setExams] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadData = async () => {
    try {
      const [examsRes, requestsRes] = await Promise.all([
        api.get('/exams'),
        api.get('/exams/publish-requests')
      ])

      setExams(examsRes.data)
      setRequests(requestsRes.data)
      setError('')
    } catch (err) {
      console.error('Failed to load exams:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useLiveUpdates(loadData)

  // The admin can only Accept or Reject a faculty publish
  // request — never record or publish results directly.
  const review = async (request, action) => {
    setBusy(request.request_id)
    setError('')
    setMessage('')

    try {
      const { data } = await api.put(
        `/exams/publish-requests/${request.request_id}/${action}`
      )

      setMessage(
        data?.message ||
        (action === 'approve'
          ? "Accepted — every student's result for this exam is now published. Blank marks were recorded as 0."
          : 'Publication request rejected.')
      )

      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const statusTone = status =>
    status === 'approved'
      ? 'success'
      : status === 'rejected'
        ? 'danger'
        : 'warning'

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Exams</h1>
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

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Result Publication Requests</h2>

        <p>
          Faculty cannot publish results directly. Each request
          covers a whole exam — accept to publish every student's
          result together (blank marks become 0), or reject it.
        </p>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Course</th>
                <th>Exam</th>
                <th>Year / term</th>
                <th>Requested by</th>
                <th>Graded</th>
                <th>Requested</th>
                <th>Status</th>
                <th>Review</th>
              </tr>
            </thead>

            <tbody>
              {requests.map(request => (
                <tr key={request.request_id}>
                  <td>
                    {request.course_code}
                    <br />
                    <small>{request.course_title}</small>
                  </td>

                  <td>
                    {request.exam_type}
                    <br />
                    <small>
                      {request.exam_date
                        ? new Date(request.exam_date).toLocaleDateString()
                        : 'No date'}
                    </small>
                  </td>

                  <td>
                    {request.academic_year} / {request.term}
                  </td>

                  <td>{request.faculty_name}</td>

                  <td>
                    {request.graded_count}/{request.student_count}
                  </td>

                  <td>
                    {new Date(request.requested_on).toLocaleDateString()}
                  </td>

                  <td>
                    <span className={`badge badge-${statusTone(request.status)}`}>
                      {request.status}
                    </span>
                  </td>

                  <td>
                    {request.status === 'pending' ? (
                      <>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy !== null}
                          onClick={() => review(request, 'approve')}
                        >
                          Accept
                        </button>
                        {' '}

                        <button
                          className="btn btn-sm btn-danger"
                          disabled={busy !== null}
                          onClick={() => review(request, 'reject')}
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <small>
                        {request.reviewed_by_name
                          ? `Reviewed by ${request.reviewed_by_name}`
                          : request.status}
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!requests.length && (
          <div className="empty-state">No publication requests</div>
        )}
      </div>

      <div className="card">
        <h2>Exam Results</h2>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Course</th>
                <th>Exam Type</th>
                <th>Date</th>
                <th>Marks</th>
                <th>Grade</th>
                <th>Remarks</th>
              </tr>
            </thead>

            <tbody>
              {exams.map(exam => (
                <tr key={exam.exam_id}>
                  <td>{exam.student_name}</td>
                  <td>{exam.course_code}</td>
                  <td>{exam.exam_type}</td>

                  <td>
                    {exam.exam_date
                      ? new Date(exam.exam_date).toLocaleDateString()
                      : 'N/A'}
                  </td>

                  <td>
                    {exam.obtained_marks ?? 'Not graded'}/{exam.total_marks}
                  </td>

                  <td>
                    <strong>{exam.grade || '-'}</strong>
                  </td>

                  <td>{exam.remarks || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {exams.length === 0 && (
          <div className="empty-state">No exam records found</div>
        )}
      </div>
    </div>
  )
}

export default Exams