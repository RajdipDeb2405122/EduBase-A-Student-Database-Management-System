import { useAuth } from './AuthContext'

export const StudentAuthProvider = ({ children }) => children

export function useStudentAuth() {
  const auth = useAuth()
  const isStudent = auth.user?.role === 'student'

  return {
    user: isStudent ? auth.user : null,
    student: isStudent ? auth.profile : null,
    isAuthenticated: isStudent,
    loading: auth.loading,
    logout: auth.logout,
    studentLogin: (email, password) =>
      auth.signIn('student', { email, password })
  }
}