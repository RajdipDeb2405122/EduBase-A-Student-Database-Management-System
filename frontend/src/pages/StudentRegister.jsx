import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'

const StudentRegister = () => {
  const navigate = useNavigate()
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const [formData, setFormData] = useState({
    registration_no: '',
    full_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    program_id: '',
    password: ''
  })

  useEffect(() => {
    loadPrograms()
  }, [])

  const loadPrograms = async () => {
    try {
      const { data } = await api.get('/programs')
      setPrograms(data)
    } catch (err) {
      console.error('Failed to load programs:', err)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      await api.post('/student-auth/register', formData)
      setSuccess('Registration request submitted! Please wait for admin approval.')
      setTimeout(() => navigate('/student-login'), 2000)
    } catch (err) {
      setError(err.message)
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
        maxWidth: '500px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '64px', height: '64px', background: '#2563eb', borderRadius: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 'bold', fontSize: '2rem', margin: '0 auto 1rem'
          }}>E</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>Student Registration</h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Request access to EduBase</p>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ background: '#d1fae5', color: '#065f46', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Registration Number (Optional)</label>
            <input type="text" className="form-input" 
              value={formData.registration_no}
              onChange={(e) => setFormData({...formData, registration_no: e.target.value})}
              placeholder="e.g., CSE2024001" />
          </div>

          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input type="text" className="form-input" required
              value={formData.full_name}
              onChange={(e) => setFormData({...formData, full_name: e.target.value})}
              placeholder="Enter your full name" />
          </div>

          <div className="form-group">
            <label className="form-label">Email *</label>
            <input type="email" className="form-input" required
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="your.email@example.com" />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input type="text" className="form-input"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                placeholder="Phone number" />
            </div>
            <div className="form-group">
              <label className="form-label">Date of Birth</label>
              <input type="date" className="form-input"
                value={formData.date_of_birth}
                onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Program *</label>
            <select className="form-select" required
              value={formData.program_id}
              onChange={(e) => setFormData({...formData, program_id: e.target.value})}>
              <option value="">Select your program</option>
              {programs.map(p => (
                <option key={p.program_id} value={p.program_id}>
                  {p.program_name} ({p.degree_level})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Create Password *</label>
            <input type="password" className="form-input" required minLength="6"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              placeholder="Minimum 6 characters" />
          </div>

          <button type="submit" className="btn btn-primary" 
            style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Submitting...' : 'Submit Registration Request'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: '#64748b' }}>
          Already registered? <Link to="/student-login" style={{ color: '#2563eb', fontWeight: '500' }}>Login here</Link>
        </div>
        
        <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem', color: '#64748b' }}>
          <Link to="/login" style={{ color: '#64748b' }}>Admin Login</Link>
        </div>
      </div>
    </div>
  )
}

export default StudentRegister