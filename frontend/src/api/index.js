// REPLACES: frontend/src/api/index.js
// Changes vs. your current file:
//   1. Request timeout (15s) so a hung backend fails cleanly instead of spinning forever.
//   2. Network/offline errors become readable messages instead of "Failed to fetch".
//   3. Errors carry .status and .endpoint so pages can react (403 -> "not allowed", etc.).

import {
  readSession,
  clearSession,
  portalRole
} from './sessionStore'

const REQUEST_TIMEOUT_MS = 15000

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

function apiError(message, status, endpoint) {
  return Object.assign(new Error(message), { status, endpoint })
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

async function request(method, endpoint, body, options = {}) {
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

  // --- timeout support -------------------------------------------------
  const controller = new AbortController()

  const timer = setTimeout(
    () => controller.abort(new Error('timeout')),
    options.timeout || REQUEST_TIMEOUT_MS
  )

  if (options.signal) {
    if (options.signal.aborted) controller.abort()
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  // ---------------------------------------------------------------------

  let response

  try {
    response = await fetch(`/api${endpoint}`, {
      method,
      cache: 'no-store',
      signal: controller.signal,

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
  } catch (networkError) {
    if (options.signal?.aborted) throw networkError

    throw apiError(
      controller.signal.aborted
        ? 'The server took too long to respond. Please try again.'
        : 'Cannot reach the server. Check that the backend is running.',
      0,
      endpoint
    )
  } finally {
    clearTimeout(timer)
  }

  const raw = await response.text()
  let data

  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    throw apiError(
      'Invalid server response. Please check the backend connection.',
      response.status,
      endpoint
    )
  }

  if (!response.ok) {
    if (response.status === 401 && session) {
      clearSession(role, session.token)
    }

    const fallback =
      response.status === 403
        ? 'You are not allowed to perform this action.'
        : response.status === 404
          ? 'The requested record was not found.'
          : 'Request failed'

    throw apiError(data?.error || fallback, response.status, endpoint)
  }

  return { data, response }
}

const api = {
  get: (url, options) => request('GET', url, undefined, options),
  post: (url, body, options) => request('POST', url, body, options),
  put: (url, body, options) => request('PUT', url, body, options),
  delete: (url, options) => request('DELETE', url, undefined, options),

  upload: (url, file, options = {}) =>
    request('PUT', url, file, { ...options, raw: true })
}

export function createApi(role) {
  return {
    get: (url, options = {}) => api.get(url, { ...options, role }),
    post: (url, body, options = {}) => api.post(url, body, { ...options, role }),
    put: (url, body, options = {}) => api.put(url, body, { ...options, role }),
    delete: (url, options = {}) => api.delete(url, { ...options, role }),
    upload: (url, file, options = {}) => api.upload(url, file, { ...options, role })
  }
}

export const adminApi = createApi('admin')
export const facultyApi = createApi('faculty')
export const studentApi = createApi('student')

export default api
