import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'

import api from '../api'
import useLiveUpdates from '../hooks/useLiveUpdates'
import useViewState from '../hooks/useViewState'

const STATE_BADGE = {
  eligible: ['success', 'Ready'],
  published: ['secondary', 'Published'],
  excluded: ['danger', 'Excluded']
}

export default function Results() {
  const [departments, setDepartments] = useState([])
  const [publications, setPublications] = useState([])
  const [preview, setPreview] = useState(null)
  const [outcome, setOutcome] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [view, setView] = useViewState(
    'edubase_admin_results',
    { department_id: '', level: '1', term: '1' }
  )

  const version = useRef(0)
  const ready = Boolean(view.department_id)

  const loadPreview = useCallback(async () => {
    const current = ++version.current

    try {
      const [pubs, next] = await Promise.all([
        api.get('/results/publications'),
        ready
          ? api.get(
              `/results/preview?department_id=${view.department_id}` +
                `&level=${view.level}&term=${view.term}`
            )
          : Promise.resolve({ data: null })
      ])

      if (current !== version.current) return

      setPublications(pubs.data)
      setPreview(next.data)
      setError('')
    } catch (e) {
      if (current === version.current) {
        setPreview(null)
        setError(e.message)
      }
    }
  }, [ready, view.department_id, view.level, view.term])

  useEffect(() => {
    api.get('/departments')
      .then(({ data }) => setDepartments(data))
      .catch(e => setError(e.message))
  }, [])

  useEffect(() => {
    setOutcome(null)
    void loadPreview()
  }, [loadPreview])

  useLiveUpdates(loadPreview)

  async function publish() {
    const count = preview.students.filter(s => s.state === 'eligible').length
    const excluded = preview.students.filter(s => s.state === 'excluded').length

    if (!window.confirm(
      `Publish ${preview.department.department_code} ${preview.label} results for ` +
        `${count} student(s)? ${excluded} student(s) will be excluded. ` +
        'Published marks can no longer be edited.'
    )) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const { data } = await api.post('/results/publish', {
        department_id: Number(view.department_id),
        level: Number(view.level),
        term: Number(view.term)
      })

      setOutcome(data)
      await loadPreview()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const groups = preview
    ? ['eligible', 'excluded', 'published'].map(state => [
        state,
        preview.students.filter(s => s.state === state)
      ])
    : []

  const eligible = groups.find(([state]) => state === 'eligible')?.[1] || []

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Result Publication</h1>
      </div>

      <div className="card">
        <div className="form-row">
          <label className="form-group">
            Department

            <select
              className="form-select"
              value={view.department_id}
              disabled={busy}
              onChange={e => setView({ department_id: e.target.value })}
            >
              <option value="">Select department</option>

              {departments.map(d => (
                <option key={d.department_id} value={d.department_id}>
                  {d.department_name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            Level

            <select
              className="form-select"
              value={view.level}
              disabled={busy}
              onChange={e => setView({ level: e.target.value })}
            >
              {[1, 2, 3, 4].map(n => (
                <option key={n} value={n}>Level {n}</option>
              ))}
            </select>
          </label>

          <label className="form-group">
            Term

            <select
              className="form-select"
              value={view.term}
              disabled={busy}
              onChange={e => setView({ term: e.target.value })}
            >
              {[1, 2].map(n => (
                <option key={n} value={n}>Term {n}</option>
              ))}
            </select>
          </label>
        </div>

        <p>
          Only students whose marks are complete (attendance, CT and
          final) in every course of the term are published. Everyone
          else is listed below with the reason. You can publish again
          later to add students whose marks have since been completed.
        </p>
      </div>

      {error && (
        <p className="badge badge-danger" role="alert" style={{ display: 'block' }}>
          {error}
        </p>
      )}

      {outcome && (
        <p className="badge badge-success" role="status" style={{ display: 'block' }}>
          Published {outcome.department.department_code} {outcome.label}:
          {' '}
          {outcome.students.filter(s => s.state === 'eligible').length} student(s)
          published,
          {' '}
          {outcome.students.filter(s => s.state === 'excluded').length} excluded.
        </p>
      )}

      {preview && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              {preview.department.department_code} Level {preview.level}, Term {preview.term}
            </h2>

            <span className={`badge badge-${preview.publication ? 'success' : 'secondary'}`}>
              {preview.publication
                ? `Published ${new Date(preview.publication.published_at).toLocaleString()}`
                : 'Not published'}
            </span>
          </div>

          <p>
            Courses:
            {' '}
            {preview.courses.map(c => c.course_code).join(', ')}
          </p>

          <div className="stats-grid">
            {groups.map(([state, list]) => (
              <div className="stat-card" key={state}>
                <div className="stat-value">{list.length}</div>
                <div className="stat-label">{STATE_BADGE[state][1]}</div>
              </div>
            ))}
          </div>

          <button
            className="btn btn-primary"
            disabled={busy || !eligible.length}
            onClick={publish}
          >
            {busy
              ? 'Publishing…'
              : `Publish results for ${eligible.length} student(s)`}
          </button>

          <div className="table-container" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>GPA</th>
                  <th>Reason / details</th>
                </tr>
              </thead>

              <tbody>
                {groups.flatMap(([, list]) => list).map(student => (
                  <tr key={student.student_id}>
                    <td>{student.registration_no}</td>
                    <td>{student.full_name}</td>

                    <td>
                      <span className={`badge badge-${STATE_BADGE[student.state][0]}`}>
                        {STATE_BADGE[student.state][1]}
                      </span>
                    </td>

                    <td>
                      {student.gpa === undefined || student.gpa === null
                        ? '—'
                        : Number(student.gpa).toFixed(2)}
                    </td>

                    <td>
                      {student.state === 'excluded' ? (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {student.reasons.map(reason => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      ) : student.state === 'eligible' ? (
                        student.courses
                          .map(c => `${c.course_code} ${c.letter_grade}`)
                          .join(', ')
                      ) : (
                        'Already published'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!preview.students.length && (
            <p className="empty-state">
              No student is registered for this term.
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h2 className="card-title">Published terms</h2>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Department</th>
                <th>Term</th>
                <th>Students</th>
                <th>First published</th>
                <th>Last published</th>
                <th>By</th>
              </tr>
            </thead>

            <tbody>
              {publications.map(p => (
                <tr key={`${p.department_id}-${p.level}-${p.term}`}>
                  <td>{p.department_code || p.department_name}</td>
                  <td>Level {p.level}, Term {p.term}</td>
                  <td>{p.student_count}</td>
                  <td>{new Date(p.published_at).toLocaleString()}</td>
                  <td>{new Date(p.last_published_at).toLocaleString()}</td>
                  <td>{p.published_by_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!publications.length && (
          <p className="empty-state">No results published yet.</p>
        )}
      </div>
    </div>
  )
}
