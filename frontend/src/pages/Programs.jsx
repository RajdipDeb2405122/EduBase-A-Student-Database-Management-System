import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'

import api from '../api'
import useLiveUpdates from '../hooks/useLiveUpdates'

const emptyForm = {
  program_name: '',
  degree_level: 'Bachelor',
  department_id: '',
  duration_years: '4',
  total_credits: '140.00'
}

const degreeLevels = [
  'Bachelor',
  'Master',
  'PhD'
]

export default function Programs() {
  const [programs, setPrograms] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)

  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const version = useRef(0)

  const loadData = useCallback(async () => {
    const current = ++version.current

    try {
      const [
        programResponse,
        departmentResponse
      ] = await Promise.all([
        api.get('/programs', { role: 'admin' }),
        api.get('/departments', { role: 'admin' })
      ])

      if (current !== version.current) return

      setPrograms(programResponse.data)
      setDepartments(departmentResponse.data)
      setLoadError('')
    } catch (error) {
      if (current === version.current) {
        setLoadError(error.message)
      }
    } finally {
      if (current === version.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadData()

    return () => {
      version.current++
    }
  }, [loadData])

  // Background updates do not overwrite the open form.
  useLiveUpdates(loadData)

  useEffect(() => {
    const warn = event => {
      if (showModal && dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', warn)

    return () => {
      window.removeEventListener('beforeunload', warn)
    }
  }, [showModal, dirty])

  const openAdd = () => {
    setEditingId(null)
    setFormData({ ...emptyForm })
    setFormError('')
    setMessage('')
    setDirty(false)
    setShowModal(true)
  }

  const openEdit = program => {
    setEditingId(program.program_id)

    setFormData({
      program_name: program.program_name || '',
      degree_level: program.degree_level || 'Bachelor',

      department_id: String(
        program.department_id ?? ''
      ),

      duration_years: String(
        program.duration_years ?? ''
      ),

      total_credits: program.total_credits == null
        ? ''
        : String(program.total_credits)
    })

    setFormError('')
    setMessage('')
    setDirty(false)
    setShowModal(true)
  }

  const closeModal = () => {
    if (saving) return

    if (
      dirty &&
      !window.confirm(
        'Discard unsaved program changes?'
      )
    ) {
      return
    }

    setShowModal(false)
    setEditingId(null)
    setDirty(false)
    setFormError('')
  }

  const change = event => {
    setDirty(true)

    setFormData(old => ({
      ...old,
      [event.target.name]: event.target.value
    }))
  }

  const submit = async event => {
    event.preventDefault()
    setFormError('')

    const departmentId = Number(
      formData.department_id
    )

    const duration = Number(
      formData.duration_years
    )

    const credits =
      formData.total_credits.trim() === ''
        ? null
        : Number(formData.total_credits)

    if (!formData.program_name.trim()) {
      setFormError('Program name is required.')
      return
    }

    if (
      !Number.isInteger(departmentId) ||
      departmentId <= 0
    ) {
      setFormError('Select a department.')
      return
    }

    if (
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > 2147483647
    ) {
      setFormError(
        'Duration must be a positive whole number.'
      )
      return
    }

    if (
      credits !== null &&
      (
        !Number.isFinite(credits) ||
        credits < 0 ||
        credits > 9999.99
      )
    ) {
      setFormError(
        'Total credits must be between 0 and 9999.99.'
      )
      return
    }

    // Send all fields expected by your existing PUT route.
    const payload = {
      program_name: formData.program_name.trim(),
      degree_level: formData.degree_level,
      department_id: departmentId,
      duration_years: duration,
      total_credits: credits
    }

    setSaving(true)

    try {
      if (editingId !== null) {
        await api.put(
          `/programs/${editingId}`,
          payload,
          { role: 'admin' }
        )
      } else {
        await api.post(
          '/programs',
          payload,
          { role: 'admin' }
        )
      }

      setMessage(
        editingId !== null
          ? 'Program updated successfully.'
          : 'Program added successfully.'
      )

      setShowModal(false)
      setEditingId(null)
      setDirty(false)
      setFormData({ ...emptyForm })

      await loadData()
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="spinner" />
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Programs</h1>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void loadData()}
          >
            Refresh
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={openAdd}
          >
            + Add Program
          </button>
        </div>
      </div>

      {loadError && (
        <p
          className="badge badge-danger"
          role="alert"
        >
          {loadError}
        </p>
      )}

      {message && (
        <p
          className="badge badge-success"
          role="status"
        >
          {message}
        </p>
      )}

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Program Name</th>
                <th>Degree Level</th>
                <th>Department</th>
                <th>Duration</th>
                <th>Total Credits</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {programs.map(program => (
                <tr key={program.program_id}>
                  <td>{program.program_name}</td>
                  <td>{program.degree_level}</td>
                  <td>{program.department_name}</td>

                  <td>
                    {program.duration_years} years
                  </td>

                  <td>
                    {program.total_credits ?? '—'}
                  </td>

                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEdit(program)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!programs.length && (
          <p className="empty-state">
            No programs found
          </p>
        )}
      </div>

      {showModal && (
        <div
          className="modal-overlay"
          onClick={closeModal}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="program-modal-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2
                id="program-modal-title"
                className="modal-title"
              >
                {editingId !== null
                  ? 'Edit Program'
                  : 'Add Program'}
              </h2>

              <button
                type="button"
                className="modal-close"
                aria-label="Close dialog"
                disabled={saving}
                onClick={closeModal}
              >
                &times;
              </button>
            </div>

            <form onSubmit={submit}>
              {formError && (
                <p
                  className="badge badge-danger"
                  role="alert"
                  style={{
                    display: 'block',
                    marginBottom: 16
                  }}
                >
                  {formError}
                </p>
              )}

              <fieldset
                disabled={saving}
                style={{
                  border: 0,
                  padding: 0,
                  margin: 0
                }}
              >
                <label
                  className="form-group"
                  style={{ display: 'block' }}
                >
                  <span className="form-label">
                    Program Name *
                  </span>

                  <input
                    type="text"
                    className="form-input"
                    name="program_name"
                    value={formData.program_name}
                    onChange={change}
                    maxLength={100}
                    required
                  />
                </label>

                <div className="form-row">
                  <label className="form-group">
                    <span className="form-label">
                      Degree Level *
                    </span>

                    <select
                      className="form-select"
                      name="degree_level"
                      value={formData.degree_level}
                      onChange={change}
                      required
                    >
                      {!degreeLevels.includes(
                        formData.degree_level
                      ) && (
                        <option
                          value={formData.degree_level}
                        >
                          {formData.degree_level}
                        </option>
                      )}

                      {degreeLevels.map(level => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="form-group">
                    <span className="form-label">
                      Department *
                    </span>

                    <select
                      className="form-select"
                      name="department_id"
                      value={formData.department_id}
                      onChange={change}
                      required
                    >
                      <option value="">
                        Select Department
                      </option>

                      {departments.map(department => (
                        <option
                          key={department.department_id}
                          value={department.department_id}
                        >
                          {department.department_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="form-row">
                  <label className="form-group">
                    <span className="form-label">
                      Duration (Years) *
                    </span>

                    <input
                      type="number"
                      className="form-input"
                      name="duration_years"
                      min="1"
                      max="2147483647"
                      step="1"
                      value={formData.duration_years}
                      onChange={change}
                      required
                    />
                  </label>

                  <label className="form-group">
                    <span className="form-label">
                      Total Credits
                    </span>

                    <input
                      type="number"
                      className="form-input"
                      name="total_credits"
                      min="0"
                      max="9999.99"
                      step="0.01"
                      value={formData.total_credits}
                      onChange={change}
                    />
                  </label>
                </div>
              </fieldset>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={closeModal}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? 'Saving…'
                    : editingId !== null
                      ? 'Save Changes'
                      : 'Add Program'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}