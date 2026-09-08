export const ROLES = ['admin', 'student', 'faculty']

export const SESSION_EVENT = 'edubase:session-changed'

export const sessionKey = role =>
  `edubase_session_${role}`

export function portalRole(
  path = window.location.pathname
) {
  const value = path.toLowerCase().replace(/\/$/, '')

  if ([
    '/faculty-login',
    '/faculty-register',
    '/faculty-dashboard'
  ].includes(value)) {
    return 'faculty'
  }

  if ([
    '/student-login',
    '/student-register',
    '/student-dashboard'
  ].includes(value)) {
    return 'student'
  }

  // For example, /faculty and /faculty-requests are admin pages.
  return 'admin'
}

export function readSession(role) {
  try {
    const value = JSON.parse(
      localStorage.getItem(sessionKey(role)) || 'null'
    )

    return (
      value?.token &&
      value.user?.role === role &&
      value.profile
    )
      ? value
      : null
  } catch {
    return null
  }
}

export function saveSession(role, value) {
  if (
    !ROLES.includes(role) ||
    value.user?.role !== role
  ) {
    throw new Error('Invalid session role')
  }

  const serialized = JSON.stringify(value)
  const key = sessionKey(role)

  if (localStorage.getItem(key) === serialized) {
    return
  }

  localStorage.setItem(key, serialized)

  window.dispatchEvent(
    new CustomEvent(SESSION_EVENT, {
      detail: { role }
    })
  )
}

export function clearSession(role, expectedToken) {
  // A late response from an old session must not remove a newer login.
  if (
    expectedToken &&
    readSession(role)?.token !== expectedToken
  ) {
    return
  }

  localStorage.removeItem(sessionKey(role))

  window.dispatchEvent(
    new CustomEvent(SESSION_EVENT, {
      detail: { role }
    })
  )
}