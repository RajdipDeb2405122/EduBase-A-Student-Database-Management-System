import { useState, useEffect } from 'react'
import api from '../api'

const AdminUsers = () => {
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    role: 'admin'
  })

  useEffect(() => {
    loadAdmins()
  }, [])

  const loadAdmins = async () => {
    try {
      const { data } = await api.get('/admin')
      setAdmins(data)
    } catch (err) {
      console.error('Failed to load admins:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/admin', formData)
      setShowModal(false)
      setFormData({ username: '', password: '', full_name: '', email: '', role: 'admin' })
      loadAdmins()
    } catch (err) {
      alert(err.message)
    }
  }

  const toggleStatus = async (id, currentStatus) => {
    try {
      await api.put(`/admin/${id}`, { status: currentStatus === 'active' ? 'suspended' : 'active' })
      loadAdmins()
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div className="spinner"></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Admin Users</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Admin</button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(a => (
                <tr key={a.admin_id}>
                  <td>{a.username}</td>
                  <td>{a.full_name}</td>
                  <td>{a.email}</td>
                  <td><span className="badge badge-info">{a.role}</span></td>
                  <td>
                    <span className={`badge badge-${a.status === 'active' ? 'success' : 'danger'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td>{a.last_login ? new Date(a.last_login).toLocaleString() : 'Never'}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => toggleStatus(a.admin_id, a.status)}
                    >
                      {a.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {admins.length === 0 && <div className="empty-state">No admin users found</div>}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Admin User</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Username *</label>
                  <input type="text" className="form-input" value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <input type="password" className="form-input" value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})} required />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input type="text" className="form-input" value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input type="email" className="form-input" value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})} required />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-select" value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Super Admin</option>
                  <option value="registrar">Registrar</option>
                  <option value="finance">Finance</option>
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Admin</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminUsers
