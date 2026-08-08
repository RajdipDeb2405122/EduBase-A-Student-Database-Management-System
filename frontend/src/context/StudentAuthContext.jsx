import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api'

const StudentAuthContext = createContext(null)

export const StudentAuthProvider = ({ children }) => {
  const [student, setStudent] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const studentId = localStorage.getItem('edubase_student_id')
    const studentData = localStorage.getItem('edubase_student_data')
    
    if (studentId && studentData) {
      setStudent(JSON.parse(studentData))
      setIsAuthenticated(true)
    }
    setLoading(false)
  }, [])

  const studentLogin = async (email) => {
    const { data } = await api.post('/student-auth/login', { email, password: 'temp' })
    
    localStorage.setItem('edubase_student_id', data.student_id)
    localStorage.setItem('edubase_student_data', JSON.stringify(data))
    
    setStudent(data)
    setIsAuthenticated(true)
    
    return data
  }

  const logout = () => {
    localStorage.removeItem('edubase_student_id')
    localStorage.removeItem('edubase_student_data')
    setStudent(null)
    setIsAuthenticated(false)
  }

  return (
    <StudentAuthContext.Provider value={{ student, isAuthenticated, loading, studentLogin, logout }}>
      {children}
    </StudentAuthContext.Provider>
  )
}

export const useStudentAuth = () => useContext(StudentAuthContext)