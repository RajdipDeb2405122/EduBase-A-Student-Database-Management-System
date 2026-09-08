import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'

export default function FacultyAuth({ registration = false }) {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const [departments, setDepartments] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    department_id: '',
    designation: 'Lecturer',
    password: '',
    confirm: ''
  })

  const change = event => {
    setForm(f => ({
      ...f,
      [event.target.name]: event.target.value
    }))
  }

  useEffect(() => {
    let active = true

    if (registration) {
      api.get('/departments')
        .then(({ data }) => {
          if (active) setDepartments(data)
        })
        .catch(e => {
          if (active) setError(e.message)
        })
    }

    return () => {
      active = false
    }
  }, [registration])

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (registration && form.password !== form.confirm) {
      return setError('Passwords do not match')
    }

    setBusy(true)

    try {
      if (registration) {
        const { confirm, ...body } = form

        await api.post('/faculty-auth/register', body)

        setSuccess(
          'Request submitted. You can log in after an admin approves it.'
        )

        setForm(f => ({
          ...f,
          password: '',
          confirm: ''
        }))
      } else {
        await signIn('faculty', {
          email: form.email,
          password: form.password
        })

        navigate('/faculty-dashboard', { replace: true })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const input = (
    name,
    label,
    type = 'text',
    required = true
  ) => (
    <label className="form-group" style={{ display: 'block' }}>
      <span className="form-label">{label}</span>

      <input
        className="form-input"
        name={name}
        type={type}
        value={form[name]}
        onChange={change}
        required={required}
        minLength={
          type === 'password' && registration ? 8 : undefined
        }
        maxLength={
          type === 'password' ? 72 : name === 'phone' ? 20 : 100
        }
      />
    </label>
  )

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">
          Faculty {registration ? 'Registration' : 'Login'}
        </h1>

        {error && (
          <p role="alert" className="badge badge-danger">
            {error}
          </p>
        )}

        {success && (
          <p role="status" className="badge badge-success">
            {success}
          </p>
        )}

        <form onSubmit={submit}>
          {registration && input('full_name', 'Full name')}
          {input('email', 'Email', 'email')}

          {registration && (
            <>
              {input('phone', 'Phone', 'tel', false)}

              <label
                className="form-group"
                style={{ display: 'block' }}
              >
                Department
                <select
                  name="department_id"
                  className="form-select"
                  required
                  value={form.department_id}
                  onChange={change}
                >
                  <option value="">Select department</option>

                  {departments.map(d => (
                    <option
                      key={d.department_id}
                      value={d.department_id}
                    >
                      {d.department_name}
                    </option>
                  ))}
                </select>
              </label>

              <label
                className="form-group"
                style={{ display: 'block' }}
              >
                Designation
                <select
                  name="designation"
                  className="form-select"
                  value={form.designation}
                  onChange={change}
                >
                  {[
                    'Lecturer',
                    'Assistant Professor',
                    'Associate Professor',
                    'Professor'
                  ].map(d => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          {input('password', 'Password', 'password')}

          {registration &&
            input('confirm', 'Confirm password', 'password')}

          <button className="btn btn-primary" disabled={busy}>
            {busy
              ? 'Please wait…'
              : registration
                ? 'Request approval'
                : 'Log in'}
          </button>
        </form>

        <p style={{ marginTop: '1rem' }}>
          <Link to={
            registration
              ? '/faculty-login'
              : '/faculty-register'
          }>
            {registration
              ? 'Faculty login'
              : 'Register as faculty'}
          </Link>
        </p>

        <p>
          <Link to="/student-login">Student login</Link>
          {' · '}
          <Link to="/login">Admin login</Link>
        </p>
      </div>
    </div>
  )
}