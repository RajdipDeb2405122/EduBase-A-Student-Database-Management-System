import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react'

import { useLocation } from 'react-router-dom'
import api from '../api'

import {
  ROLES,
  SESSION_EVENT,
  sessionKey,
  portalRole,
  readSession,
  saveSession,
  clearSession
} from '../api/sessionStore'

const AuthContext = createContext(null)

const allSessions = () =>
  Object.fromEntries(
    ROLES.map(role => [role, readSession(role)])
  )

async function revoke(token) {
  if (!token) return

  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      keepalive: true,
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error('Logout request failed')
    }
  } catch {
    console.warn(
      'Signed out locally; the server could not be reached to revoke the session.'
    )
  }
}

export function AuthProvider({ children }) {
  const [sessions, setSessions] = useState(allSessions)

  const attempts = useRef({
    admin: 0,
    student: 0,
    faculty: 0
  })

  useEffect(() => {
    const syncRole = role => {
      if (!ROLES.includes(role)) return

      setSessions(old => ({
        ...old,
        [role]: readSession(role)
      }))
    }

    const sameTab = event => {
      syncRole(event.detail.role)
    }

    const otherTab = event => {
      if (event.key === null) {
        setSessions(allSessions())
        return
      }

      const role = ROLES.find(
        item => sessionKey(item) === event.key
      )

      if (role) syncRole(role)
    }

    window.addEventListener(
      SESSION_EVENT,
      sameTab
    )

    window.addEventListener(
      'storage',
      otherTab
    )

    // Validate saved sessions without removing them on network failures.
    for (const role of ROLES) {
      const saved = readSession(role)

      if (!saved) continue

      api.get('/auth/session', { role })
        .then(({ data }) => {
          if (
            readSession(role)?.token === saved.token
          ) {
            saveSession(role, {
              token: saved.token,
              ...data
            })
          }
        })
        .catch(() => {
          // A genuine 401 is already handled by the API client.
          // Temporary network/server errors must not erase a login.
        })
    }

    return () => {
      window.removeEventListener(
        SESSION_EVENT,
        sameTab
      )

      window.removeEventListener(
        'storage',
        otherTab
      )
    }
  }, [])

  const signIn = useCallback(
    async (role, credentials) => {
      if (!ROLES.includes(role)) {
        throw new Error('Invalid portal')
      }

      const attempt = ++attempts.current[role]
      const previous = readSession(role)

      const endpoint = role === 'admin'
        ? '/auth/login'
        : `/${role}-auth/login`

      const { data } = await api.post(
        endpoint,
        credentials,
        { public: true, role }
      )

      const changedDuringLogin =
        attempt !== attempts.current[role] ||
        readSession(role)?.token !== previous?.token

      if (changedDuringLogin) {
        await revoke(data.token)

        throw new Error(
          'This portal’s session changed. Please try again.'
        )
      }

      saveSession(role, {
        token: data.token,
        user: data.user,
        profile: data.profile
      })

      // Replace only the previous session for this role.
      if (
        previous?.token &&
        previous.token !== data.token
      ) {
        void revoke(previous.token)
      }

      return data.profile
    },
    []
  )

  const logout = useCallback(role => {
    attempts.current[role]++

    const saved = readSession(role)

    clearSession(role)
    void revoke(saved?.token)
  }, [])

  return (
    <AuthContext.Provider value={{
      sessions,
      signIn,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useRoleAuth(role) {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('AuthProvider is missing')
  }

  const session = context.sessions[role]

  return {
    role,

    user: session?.user || null,
    profile: session?.profile || null,
    token: session?.token || null,

    admin: role === 'admin'
      ? session?.profile || null
      : null,

    isAuthenticated: Boolean(session?.user),

    loading: false,

    signIn: context.signIn,

    login: (username, password) =>
      context.signIn('admin', {
        username,
        password
      }),

    logout: () => context.logout(role)
  }
}

// Compatible with existing useAuth() calls.
// Administrative /faculty and /faculty-requests pages remain admin pages.
export function useAuth(roleOverride) {
  const { pathname } = useLocation()

  return useRoleAuth(
    roleOverride || portalRole(pathname)
  )
}