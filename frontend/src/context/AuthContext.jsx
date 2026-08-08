import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('edubase_token')
    const storedAdmin = localStorage.getItem('edubase_admin')
    
    if (token && storedAdmin) {
      setAdmin(JSON.parse(storedAdmin))
      setIsAuthenticated(true)
    }
    setLoading(false)
  }, [])

  const login = async (username, password) => {
    const response = await api.post('/auth/login', { username, password })
    const { token, admin: adminData } = response.data
    
    localStorage.setItem('edubase_token', token)
    localStorage.setItem('edubase_admin', JSON.stringify(adminData))
    
    setAdmin(adminData)
    setIsAuthenticated(true)
    
    return adminData
  }

  const logout = () => {
    localStorage.removeItem('edubase_token')
    localStorage.removeItem('edubase_admin')
    setAdmin(null)
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ admin, isAuthenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
