import {
  BrowserRouter,
  Routes,
  Route,
  Navigate
} from 'react-router-dom'

import { AuthProvider, useAuth } from './context/AuthContext'

import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Students from './pages/Students'
import StudentDetail from './pages/StudentDetail'
import Courses from './pages/Courses'
import Enrollments from './pages/Enrollments'
import Exams from './pages/Exams'
import Payments from './pages/Payments'
import Scholarships from './pages/Scholarships'
import Faculty from './pages/Faculty'
import Programs from './pages/Programs'
import Departments from './pages/Departments'
import AdminUsers from './pages/AdminUsers'
import ActivityLog from './pages/ActivityLog'
import PendingRequests from './pages/PendingRequests'
import CourseRegistrationRequests from './pages/CourseRegistrationRequests'
import StudentRegister from './pages/StudentRegister'
import StudentLogin from './pages/StudentLogin'
import StudentDashboard from './pages/StudentDashboard'
import FacultyAuth from './pages/FacultyAuth'
import FacultyDashboard from './pages/FacultyDashboard'
import RegistrationRequests from './pages/RegistrationRequests'

function Guard({ role, children }) {
  const { user, loading } = useAuth()

  if (loading) return <div className="spinner" />

  const login = role === 'admin'
    ? '/login'
    : `/${role}-login`

  return user?.role === role
    ? children
    : <Navigate to={login} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/student-login" element={<StudentLogin />} />
          <Route
            path="/student-register"
            element={<StudentRegister />}
          />

          <Route
            path="/faculty-login"
            element={<FacultyAuth />}
          />

          <Route
            path="/faculty-register"
            element={<FacultyAuth registration />}
          />

          <Route
            path="/"
            element={
              <Guard role="admin">
                <Layout />
              </Guard>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="students" element={<Students />} />
            <Route path="students/:id" element={<StudentDetail />} />
            <Route path="courses" element={<Courses />} />
            <Route path="enrollments" element={<Enrollments />} />
            <Route path="exams" element={<Exams />} />
            <Route path="payments" element={<Payments />} />
            <Route path="scholarships" element={<Scholarships />} />
            <Route path="faculty" element={<Faculty />} />
            <Route path="programs" element={<Programs />} />
            <Route path="departments" element={<Departments />} />
            <Route path="admin-users" element={<AdminUsers />} />
            <Route path="activity-log" element={<ActivityLog />} />

            <Route
              path="pending-requests"
              element={<PendingRequests />}
            />

            <Route
              path="faculty-requests"
              element={<RegistrationRequests role="faculty" />}
            />

            <Route
              path="course-registration-requests"
              element={<CourseRegistrationRequests />}
            />
          </Route>

          <Route
            path="/student-dashboard"
            element={
              <Guard role="student">
                <StudentDashboard />
              </Guard>
            }
          />

          <Route
            path="/faculty-dashboard"
            element={
              <Guard role="faculty">
                <FacultyDashboard />
              </Guard>
            }
          />

          <Route
            path="*"
            element={<Navigate to="/login" replace />}
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}