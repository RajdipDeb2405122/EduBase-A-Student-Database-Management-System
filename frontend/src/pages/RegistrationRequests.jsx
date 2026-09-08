import {
  useEffect,
  useState,
  useCallback,
  useRef
} from 'react'

import api from '../api'
import useLiveUpdates from '../hooks/useLiveUpdates'

export default function RegistrationRequests({
  role = 'student'
}) {
  const [requests, setRequests] = useState([])
  const [faculty, setFaculty] = useState([])
  const [filter, setFilter] = useState('pending')
  const [entries, setEntries] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadVersion = useRef(0)

  const load = useCallback(async () => {
    const version = ++loadVersion.current

    const [requestResponse, facultyResponse] =
      await Promise.all([
        api.get(
          `/${role}-registration?status=${filter}`
        ),

        role === 'student'
          ? api.get('/faculty')
          : Promise.resolve({ data: [] })
      ])

    if (version !== loadVersion.current) return

    setRequests(requestResponse.data)

    setFaculty(
      facultyResponse.data.filter(
        person => person.status === 'active'
      )
    )
  }, [role, filter])

  useEffect(() => {
    load().catch(e => setError(e.message))
  }, [load])

  useLiveUpdates(() =>
    load().catch(e => setError(e.message))
  )

  function edit(request, field, value) {
    const key = `${role}:${request.request_id}`

    setEntries(old => ({
      ...old,

      [key]: {
        ...old[key],
        [field]: value
      }
    }))
  }

  async function act(request, action) {
    setError('')

    const values =
      entries[`${role}:${request.request_id}`] || {}

    let body = {}

    if (
      action === 'approve' &&
      role === 'student'
    ) {
      body = {
        advisor_id: values.advisor_id,

        registration_no:
          values.registration_no ??
          request.registration_no ??
          ''
      }

      if (
        !body.advisor_id ||
        !/^\d{7}$/.test(body.registration_no)
      ) {
        return setError(
          'Select an advisor and provide a seven-digit registration number.'
        )
      }
    }

    if (action === 'reject') {
      const reason = window.prompt(
        'Reason for rejection:'
      )

      if (reason === null) return

      body = {
        rejection_reason:
          reason || 'No reason provided'
      }
    }

    setBusy(true)

    try {
      await api.put(
        `/${role}-registration/${request.request_id}/${action}`,
        body
      )

      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          {role === 'faculty' ? 'Faculty' : 'Student'}
          {' registration requests'}
        </h1>

        <select
          className="form-select"
          style={{ width: 180 }}
          value={filter}
          disabled={busy}
          onChange={e => setFilter(e.target.value)}
        >
          {[
            'pending',
            'approved',
            'rejected'
          ].map(status => (
            <option key={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="badge badge-danger" role="alert">
          {error}
        </p>
      )}

      <div className="card table-container">
        <table>
          <thead>
            <tr>
              <th>Name / email</th>

              <th>
                {role === 'student'
                  ? 'Program'
                  : 'Department / designation'}
              </th>

              <th>Requested</th>
              <th>Review</th>
            </tr>
          </thead>

          <tbody>
            {requests.map(request => {
              const values =
                entries[
                  `${role}:${request.request_id}`
                ] || {}

              return (
                <tr key={request.request_id}>
                  <td>
                    {request.full_name}
                    <br />
                    {request.email}
                    <br />
                    {request.phone}
                  </td>

                  <td>
                    {request.program_name ||
                      request.department_name}
                    <br />
                    {request.designation}
                  </td>

                  <td>
                    {String(
                      request.requested_on
                    ).slice(0, 10)}
                  </td>

                  <td>
                    {filter !== 'pending' ? (
                      request.rejection_reason ||
                      `Reviewed by ${request.reviewed_by_name || 'admin'}`
                    ) : (
                      <>
                        {role === 'student' && (
                          <div className="form-row">
                            <input
                              aria-label="Registration number"
                              className="form-input"
                              maxLength={7}
                              placeholder="Registration number"
                              value={
                                values.registration_no ??
                                request.registration_no ??
                                ''
                              }
                              onChange={e =>
                                edit(
                                  request,
                                  'registration_no',
                                  e.target.value.replace(
                                    /\D/g,
                                    ''
                                  )
                                )
                              }
                            />

                            <select
                              aria-label="Advisor"
                              className="form-select"
                              value={
                                values.advisor_id || ''
                              }
                              onChange={e =>
                                edit(
                                  request,
                                  'advisor_id',
                                  e.target.value
                                )
                              }
                            >
                              <option value="">
                                Select advisor
                              </option>

                              {faculty.map(person => (
                                <option
                                  key={person.faculty_id}
                                  value={person.faculty_id}
                                >
                                  {person.full_name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() =>
                            act(request, 'approve')
                          }
                        >
                          Approve
                        </button>
                        {' '}

                        <button
                          className="btn btn-sm btn-danger"
                          disabled={busy}
                          onClick={() =>
                            act(request, 'reject')
                          }
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
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