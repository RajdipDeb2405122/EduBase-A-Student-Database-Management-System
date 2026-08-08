import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStudentAuth } from '../context/StudentAuthContext'

const StudentLogin = () => {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { studentLogin } = useStudentAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await studentLogin(email)
      navigate('/student-dashboard')
    } catch (err) {
      setError(err.message || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{ 
        background: 'white', 
        borderRadius: '16px', 
        padding: '2.5rem', 
        width: '100%', 
        maxWidth: '400px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '64px', height: '64px', background: '#2563eb', borderRadius: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 'bold', fontSize: '2rem', margin: '0 auto 1rem'
          }}>E</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>Student Login</h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Access your EduBase account</p>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className="form-input" required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com" />
          </div>

          <button type="submit" className="btn btn-primary" 
            style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: '#64748b' }}>
          Don't have an account? <Link to="/student-register" style={{ color: '#2563eb', fontWeight: '500' }}>Register here</Link>
        </div>
        
        <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem', color: '#64748b' }}>
          <Link to="/login" style={{ color: '#64748b' }}>Admin Login</Link>
        </div>
      </div>
    </div>
  )
}

export default StudentLogin