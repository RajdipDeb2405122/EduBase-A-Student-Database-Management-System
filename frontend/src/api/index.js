import {
  readSession,
  clearSession,
  portalRole
} from './sessionStore'

function requestRole(endpoint) {
  if (endpoint.startsWith('/faculty-portal')) {
    return 'faculty'
  }

  if (
    endpoint.startsWith('/student-auth') ||
    endpoint === '/course-registration/request'
  ) {
    return 'student'
  }

  return portalRole()
}

export async function openStream(role, signal) {
  const session = readSession(role)

  if (!session) {
    throw new Error('Not signed in')
  }

  const response = await fetch('/api/live', {
    headers: {
      Authorization: `Bearer ${session.token}`
    },
    cache: 'no-store',
    signal
  })

  if (response.status === 401) {
    clearSession(role, session.token)
  }

  if (!response.ok) {
    throw new Error('Live connection unavailable')
  }

  return response
}

async function request(
  method,
  endpoint,
  body,
  options = {}
) {
  const role = options.role || requestRole(endpoint)
  const rawBody = options.raw === true

  const publicEndpoint = [
    '/auth/login',
    '/student-auth/login',
    '/faculty-auth/login',
    '/student-auth/register',
    '/faculty-auth/register'
  ].includes(endpoint)

  const session = options.public || publicEndpoint
    ? null
    : readSession(role)

  const response = await fetch(`/api${endpoint}`, {
    method,
    cache: 'no-store',
    signal: options.signal,

    headers: {
      ...(body !== undefined && {
        'Content-Type': rawBody
          ? body.type || 'application/octet-stream'
          : 'application/json'
      }),

      ...(session && {
        Authorization: `Bearer ${session.token}`
      })
    },

    ...(body !== undefined && {
      body: rawBody ? body : JSON.stringify(body)
    })
  })

  const raw = await response.text()
  let data

  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    throw new Error(
      'Invalid server response. Please check the backend connection.'
    )
  }

  if (!response.ok) {
    if (response.status === 401 && session) {
      clearSession(role, session.token)
    }

    throw Object.assign(
      new Error(data?.error || 'Request failed'),
      { status: response.status }
    )
  }

  return { data, response }
}

const api = {
  get: (url, options) =>
    request('GET', url, undefined, options),

  post: (url, body, options) =>
    request('POST', url, body, options),

  put: (url, body, options) =>
    request('PUT', url, body, options),

  delete: (url, options) =>
    request('DELETE', url, undefined, options),

  upload: (url, file, options = {}) =>
    request('PUT', url, file, {
      ...options,
      raw: true
    })
}

export function createApi(role) {
  return {
    get: (url, options = {}) =>
      api.get(url, { ...options, role }),

    post: (url, body, options = {}) =>
      api.post(url, body, { ...options, role }),

    put: (url, body, options = {}) =>
      api.put(url, body, { ...options, role }),

    delete: (url, options = {}) =>
      api.delete(url, { ...options, role }),

    upload: (url, file, options = {}) =>
      api.upload(url, file, { ...options, role })
  }
}

export const adminApi = createApi('admin')
export const facultyApi = createApi('faculty')
export const studentApi = createApi('student')

export default api