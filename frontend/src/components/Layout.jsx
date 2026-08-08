import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const Layout = () => {
  const { admin, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const getInitials = (name) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'A'
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">E</div>
          <span className="sidebar-title">EduBase</span>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            📊 Dashboard
          </NavLink>
          // ADD this to the sidebar navigation (in the Admin section):
          <NavLink to="/pending-requests" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            📥 Pending Requests
          </NavLink>

          <div className="nav-section-title">Academic</div>
          <NavLink to="/students" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            👥 Students
          </NavLink>
          <NavLink to="/courses" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            📚 Courses
          </NavLink>
          <NavLink to="/enrollments" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            ✅ Enrollments
          </NavLink>
          <NavLink to="/exams" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            📝 Exams
          </NavLink>

          <div className="nav-section-title">Finance</div>
          <NavLink to="/payments" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            💰 Payments
          </NavLink>
          <NavLink to="/scholarships" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            🎓 Scholarships
          </NavLink>

          <div className="nav-section-title">Management</div>
          <NavLink to="/faculty" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            👨‍🏫 Faculty
          </NavLink>
          <NavLink to="/programs" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            📋 Programs
          </NavLink>
          <NavLink to="/departments" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            🏢 Departments
          </NavLink>

          <div className="nav-section-title">Admin</div>
          <NavLink to="/admin-users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            🔐 Admin Users
          </NavLink>
          <NavLink to="/activity-log" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            📜 Activity Log
          </NavLink>
        </nav>
      </aside>

      <main className="main-content">
        <div className="page-header" style={{ justifyContent: 'flex-end', marginBottom: '2rem' }}>
          <div className="user-menu">
            <div className="user-info">
              <div className="user-name">{admin?.full_name}</div>
              <div className="user-role">{admin?.role}</div>
            </div>
            <div className="user-avatar">{getInitials(admin?.full_name)}</div>
          </div>
          <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
        </div>

        <Outlet />
      </main>
    </div>
  )
}

export default Layout
