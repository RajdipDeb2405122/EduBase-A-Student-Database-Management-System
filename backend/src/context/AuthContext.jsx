import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback
} from 'react'

import api, { TOKEN_KEY } from '../api'

const AuthContext = createContext(null)

const clearStorage = () => {
  [
    TOKEN_KEY,
    'edubase_user',
    'edubase_admin',
    'edubase_student_token',
    'edubase_student_id',
    'edubase_student_data',
    'edubase_student_user',
    'edubase_faculty_token'
  ].forEach(key => localStorage.removeItem(key))
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const version = useRef(0)

  const logout = useCallback(() => {
    version.current++
    clearStorage()
    setSession(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    let mounted = true
    const current = version.current

    if (localStorage.getItem(TOKEN_KEY)) {
      api.get('/auth/session')
        .then(({ data }) => {
          if (mounted && current === version.current) {
            setSession(data)
          }
        })
        .catch(() => {
          if (mounted && current === version.current) {
            logout()
          }
        })
        .finally(() => {
          if (mounted && current === version.current) {
            setLoading(false)
          }
        })
    } else {
      setLoading(false)
    }

    const sync = event => {
      if (event.key === TOKEN_KEY) {
        window.location.reload()
      }
    }

    window.addEventListener('edubase:unauthorized', logout)
    window.addEventListener('storage', sync)

    return () => {
      mounted = false
      window.removeEventListener('edubase:unauthorized', logout)
      window.removeEventListener('storage', sync)
    }
  }, [logout])

  async function signIn(role, credentials) {
    const current = ++version.current

    clearStorage()
    setSession(null)
    setLoading(true)

    try {
      const endpoint = role === 'admin'
        ? '/auth/login'
        : `/${role}-auth/login`

      const { data } = await api.post(endpoint, credentials)

      if (current !== version.current) {
        throw new Error('Session changed. Please try again.')
      }

      clearStorage()
      localStorage.setItem(TOKEN_KEY, data.token)

      setSession({
        user: data.user,
        profile: data.profile
      })

      return data.profile
    } finally {
      if (current === version.current) {
        setLoading(false)
      }
    }
  }

  const user = session?.user || null

  return (
    <AuthContext.Provider value={{
      user,
      profile: session?.profile || null,
      admin: user?.role === 'admin' ? session.profile : null,
      isAuthenticated: user?.role === 'admin',
      loading,
      logout,
      signIn,
      login: (username, password) =>
        signIn('admin', { username, password })
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)