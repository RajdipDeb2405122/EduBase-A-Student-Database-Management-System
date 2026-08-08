import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { StudentAuthProvider, useStudentAuth } from './context/StudentAuthContext'
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
import Layout from './components/Layout'
import StudentRegister from './pages/StudentRegister'
import StudentLogin from './pages/StudentLogin'
import StudentDashboard from './pages/StudentDashboard'

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? children : <Navigate to="/login" />
}

const StudentProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useStudentAuth()
  return isAuthenticated ? children : <Navigate to="/student-login" />
}

function App() {
  return (
    <AuthProvider>
      <StudentAuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/student-register" element={<StudentRegister />} />
            <Route path="/student-login" element={<StudentLogin />} />
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
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
              <Route path="pending-requests" element={<PendingRequests />} />
            </Route>
            <Route path="/student-dashboard" element={
              <StudentProtectedRoute>
                <StudentDashboard />
              </StudentProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
      </StudentAuthProvider>
    </AuthProvider>
  )
}

export default App