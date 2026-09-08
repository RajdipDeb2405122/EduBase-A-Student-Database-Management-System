import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import { useNavigate } from 'react-router-dom'
import { createApi } from '../api'
import { useRoleAuth } from '../context/AuthContext'
import ProfileAvatar from './ProfileAvatar'

const personalFields = [
  {
    name: 'bengali_name',
    label: 'Bengali name / বাংলা নাম',
    max: 150,
    lang: 'bn',
    placeholder: 'বাংলায় আপনার নাম'
  },
  {
    name: 'phone',
    label: 'Phone',
    type: 'tel',
    max: 20
  },
  {
    name: 'date_of_birth',
    label: 'Date of birth',
    type: 'date'
  },
  {
    name: 'father_name',
    label: "Father's name",
    max: 150
  },
  {
    name: 'mother_name',
    label: "Mother's name",
    max: 150
  },
  {
    name: 'address',
    label: 'Address',
    type: 'textarea',
    max: 1000
  },
  {
    name: 'emergency_contact_name',
    label: 'Emergency contact name',
    max: 150
  },
  {
    name: 'emergency_contact_phone',
    label: 'Emergency contact phone',
    type: 'tel',
    max: 30
  }
]

const facultyFields = [
  {
    name: 'office_location',
    label: 'Office location',
    max: 100
  },
  {
    name: 'office_hours',
    label: 'Office hours',
    max: 200
  }
]

const valuesFrom = (profile, fields) =>
  Object.fromEntries(
    fields.map(field => [
      field.name,
      profile?.[field.name] ?? ''
    ])
  )

export default function ProfileEditor({
  role,
  profile,
  onSaved
}) {
  const api = useMemo(
    () => createApi(role),
    [role]
  )

  const fields = useMemo(
    () => role === 'faculty'
      ? [...personalFields, ...facultyFields]
      : personalFields,
    [role]
  )

  const { logout } = useRoleAuth(role)
  const navigate = useNavigate()

  const [form, setForm] = useState(
    () => valuesFrom(profile, fields)
  )

  const [photo, setPhoto] = useState(
    profile?.profile_photo || null
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirm: ''
  })

  const dirty = useRef(new Set())

  // The parent dashboards already handle live updates.
  // Only untouched fields are replaced with incoming values.
  useEffect(() => {
    const incoming = valuesFrom(profile, fields)

    setForm(old =>
      Object.fromEntries(
        fields.map(field => [
          field.name,

          dirty.current.has(field.name)
            ? old[field.name] ?? ''
            : incoming[field.name]
        ])
      )
    )

    setPhoto(profile?.profile_photo || null)
  }, [profile, fields])

  useEffect(() => {
    const warn = event => {
      if (dirty.current.size) {
        event.preventDefault()
        event.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', warn)

    return () => {
      window.removeEventListener('beforeunload', warn)
    }
  }, [])

  const edit = (name, value) => {
    dirty.current.add(name)

    setForm(old => ({
      ...old,
      [name]: value
    }))
  }

  async function save(event) {
    event.preventDefault()

    if (!dirty.current.size) return

    setBusy(true)
    setError('')
    setMessage('')

    try {
      // Submit only changed fields.
      const changes = Object.fromEntries(
        [...dirty.current].map(name => [
          name,
          form[name]
        ])
      )

      const { data } = await api.put(
        '/profile/me',
        changes
      )

      dirty.current.clear()
      setForm(valuesFrom(data, fields))
      setPhoto(data.profile_photo || null)

      setMessage('Profile updated successfully.')
      onSaved?.(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0]

    // Allow selecting the same file again later.
    event.target.value = ''

    if (!file) return

    setError('')
    setMessage('')

    if (![
      'image/jpeg',
      'image/png',
      'image/webp'
    ].includes(file.type)) {
      setError(
        'Choose a JPG, PNG or WebP image. SVG and GIF files are not supported.'
      )
      return
    }

    if (file.size > 3 * 1024 * 1024) {
      setError('Photo must be 3 MB or smaller.')
      return
    }

    setBusy(true)

    try {
      const { data } = await api.upload(
        '/profile/photo',
        file
      )

      setPhoto(data.profile_photo)

      setMessage(
        'Profile picture updated. Your other unsaved fields are unchanged.'
      )

      onSaved?.(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto() {
    setBusy(true)
    setError('')
    setMessage('')

    try {
      const { data } = await api.delete(
        '/profile/photo'
      )

      setPhoto(null)
      setMessage('Profile picture removed.')
      onSaved?.(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function discard() {
    dirty.current.clear()
    setForm(valuesFrom(profile, fields))
    setMessage('Unsaved profile changes discarded.')
    setError('')
  }

  async function changePassword(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (
      passwords.newPassword !== passwords.confirm
    ) {
      return setError('Passwords do not match.')
    }

    if (
      dirty.current.size &&
      !window.confirm(
        'Changing your password signs you out. Discard unsaved profile changes and continue?'
      )
    ) {
      return
    }

    setBusy(true)

    try {
      await api.post('/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword
      })

      dirty.current.clear()
      logout()

      navigate(`/${role}-login`, {
        replace: true
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!profile) {
    return <p>Your profile is loading.</p>
  }

  return (
    <div data-testid="profile-editor">
      {error && (
        <p
          className="badge badge-danger"
          role="alert"
          style={{
            display: 'block',
            marginBottom: 12
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
            marginBottom: 12
          }}
        >
          {message}
        </p>
      )}

      <div className="card">
        <h2>Profile picture</h2>

        <div style={{
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginTop: 16
        }}>
          <ProfileAvatar
            src={photo}
            name={profile.full_name}
            size={112}
          />

          <div>
            <strong>{profile.full_name}</strong>
            <p>{profile.email}</p>

            <label
              className="form-label"
              htmlFor={`${role}-profile-photo`}
            >
              Upload / change profile picture
            </label>

            <input
              id={`${role}-profile-photo`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Upload profile picture"
              disabled={busy}
              onChange={uploadPhoto}
            />

            <p style={{
              fontSize: '0.85rem',
              color: '#64748b'
            }}>
              JPG, PNG or WebP, up to 3 MB and 25 megapixels.
              Automatically cropped to 256 × 256.
              Photos save immediately and their location
              metadata is removed.
            </p>

            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={busy || !photo}
              onClick={removePhoto}
            >
              Remove picture
            </button>
          </div>
        </div>
      </div>

      <form className="card" onSubmit={save}>
        <h2>Update personal information</h2>

        <p>
          These fields are optional. Bengali text is supported.
          Your official English name, email and academic details
          are managed by the administration.
        </p>

        <fieldset
          disabled={busy}
          style={{
            border: 0,
            padding: 0,
            margin: 0
          }}
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16
          }}>
            {fields.map(field => (
              <label
                className="form-group"
                key={field.name}
                style={{ display: 'block' }}
              >
                <span className="form-label">
                  {field.label}
                </span>

                {field.type === 'textarea' ? (
                  <textarea
                    className="form-input"
                    name={field.name}
                    rows={3}
                    maxLength={field.max}
                    value={form[field.name] || ''}
                    onChange={e =>
                      edit(field.name, e.target.value)
                    }
                  />
                ) : (
                  <input
                    className="form-input"
                    name={field.name}
                    type={field.type || 'text'}
                    lang={field.lang}
                    placeholder={field.placeholder}
                    maxLength={field.max}
                    max={
                      field.type === 'date'
                        ? new Date().toISOString().slice(0, 10)
                        : undefined
                    }
                    value={form[field.name] || ''}
                    onChange={e =>
                      edit(field.name, e.target.value)
                    }
                  />
                )}
              </label>
            ))}
          </div>

          <div style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginTop: 16
          }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!dirty.current.size}
            >
              {busy ? 'Please wait…' : 'Save profile'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              disabled={!dirty.current.size}
              onClick={discard}
            >
              Discard changes
            </button>

            {dirty.current.size > 0 && (
              <span style={{ alignSelf: 'center' }}>
                Unsaved changes
              </span>
            )}
          </div>
        </fieldset>
      </form>

      <form className="card" onSubmit={changePassword}>
        <h2>Change password</h2>

        <p>
          Changing your password signs out this account for
          security. Other roles remain logged in.
        </p>

        <fieldset
          disabled={busy}
          style={{
            border: 0,
            padding: 0,
            margin: 0
          }}
        >
          {Object.entries({
            currentPassword: 'Current password',
            newPassword: 'New password',
            confirm: 'Confirm new password'
          }).map(([name, label]) => (
            <label
              className="form-group"
              key={name}
              style={{ display: 'block' }}
            >
              <span className="form-label">
                {label}
              </span>

              <input
                className="form-input"
                type="password"
                required
                maxLength={72}
                minLength={
                  name === 'currentPassword'
                    ? undefined
                    : 8
                }
                autoComplete={
                  name === 'currentPassword'
                    ? 'current-password'
                    : 'new-password'
                }
                value={passwords[name]}
                onChange={e =>
                  setPasswords(old => ({
                    ...old,
                    [name]: e.target.value
                  }))
                }
              />
            </label>
          ))}

          <button
            className="btn btn-primary"
            type="submit"
          >
            Change password and sign out
          </button>
        </fieldset>
      </form>
    </div>
  )
}