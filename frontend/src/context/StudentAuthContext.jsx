import { useRoleAuth } from './AuthContext'

export const StudentAuthProvider = ({ children }) =>
  children

export function useStudentAuth() {
  const auth = useRoleAuth('student')

  return {
    user: auth.user,
    student: auth.profile,
    token: auth.token,
    isAuthenticated: auth.isAuthenticated,
    loading: auth.loading,
    logout: auth.logout,

    studentLogin: (email, password) =>
      auth.signIn('student', {
        email,
        password
      })
  }
}