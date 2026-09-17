import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'

import api from '../api'
import useLiveUpdates from '../hooks/useLiveUpdates'

const emptyForm = {
  department_name: '',
  office_location: '',
  phone: ''
}

export default function Departments() {
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

  const loadDepartments = useCallback(async () => {
    const current = ++version.current

    try {
      const { data } = await api.get('/departments', {
        role: 'admin'
      })

      if (current !== version.current) return

      setDepartments(data)
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
    void loadDepartments()

    return () => {
      version.current++
    }
  }, [loadDepartments])

  // Refresh the list without changing an open form.
  useLiveUpdates(loadDepartments)

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

  const openEdit = department => {
    setEditingId(department.department_id)

    setFormData({
      department_name: department.department_name || '',
      office_location: department.office_location || '',
      phone: department.phone || ''
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
        'Discard unsaved department changes?'
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

    const payload = {
      department_name: formData.department_name.trim(),
      office_location:
        formData.office_location.trim() || null,
      phone: formData.phone.trim() || null
    }

    if (!payload.department_name) {
      setFormError('Department name is required.')
      return
    }

    setSaving(true)

    try {
      if (editingId !== null) {
        await api.put(
          `/departments/${editingId}`,
          payload,
          { role: 'admin' }
        )
      } else {
        await api.post(
          '/departments',
          payload,
          { role: 'admin' }
        )
      }

      setMessage(
        editingId !== null
          ? 'Department updated successfully.'
          : 'Department added successfully.'
      )

      setShowModal(false)
      setEditingId(null)
      setDirty(false)
      setFormData({ ...emptyForm })

      await loadDepartments()
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
        <h1 className="page-title">Departments</h1>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void loadDepartments()}
          >
            Refresh
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={openAdd}
          >
            + Add Department
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
                <th>Department Name</th>
                <th>Office Location</th>
                <th>Phone</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {departments.map(department => (
                <tr key={department.department_id}>
                  <td>{department.department_name}</td>

                  <td>
                    {department.office_location || 'N/A'}
                  </td>

                  <td>
                    {department.phone || 'N/A'}
                  </td>

                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEdit(department)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!departments.length && (
          <p className="empty-state">
            No departments found
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
            aria-labelledby="department-modal-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2
                id="department-modal-title"
                className="modal-title"
              >
                {editingId !== null
                  ? 'Edit Department'
                  : 'Add Department'}
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
                    Department Name *
                  </span>

                  <input
                    type="text"
                    className="form-input"
                    name="department_name"
                    value={formData.department_name}
                    onChange={change}
                    maxLength={100}
                    required
                  />
                </label>

                <div className="form-row">
                  <label className="form-group">
                    <span className="form-label">
                      Office Location
                    </span>

                    <input
                      type="text"
                      className="form-input"
                      name="office_location"
                      value={formData.office_location}
                      onChange={change}
                      maxLength={100}
                    />
                  </label>

                  <label className="form-group">
                    <span className="form-label">
                      Phone
                    </span>

                    <input
                      type="tel"
                      className="form-input"
                      name="phone"
                      value={formData.phone}
                      onChange={change}
                      maxLength={20}
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
                      : 'Add Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}