export const TOKEN_KEY = 'edubase_token'

async function request(method, endpoint, body) {
  const token = localStorage.getItem(TOKEN_KEY)

  const response = await fetch(`/api${endpoint}`, {
    method,
    headers: {
      ...(body !== undefined && {
        'Content-Type': 'application/json'
      }),
      ...(token && {
        Authorization: `Bearer ${token}`
      })
    },
    ...(body !== undefined && {
      body: JSON.stringify(body)
    })
  })

  const raw = await response.text()
  let data

  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    throw new Error(
      'The server returned an invalid response. Check that the backend is running.'
    )
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      token &&
      token === localStorage.getItem(TOKEN_KEY) &&
      !/\/(login|register)$/.test(endpoint)
    ) {
      window.dispatchEvent(new Event('edubase:unauthorized'))
    }

    throw Object.assign(
      new Error(data?.error || 'Request failed'),
      { status: response.status }
    )
  }

  return { data, response }
}

export default {
  get: endpoint => request('GET', endpoint),
  post: (endpoint, body) => request('POST', endpoint, body),
  put: (endpoint, body) => request('PUT', endpoint, body),
  delete: endpoint => request('DELETE', endpoint)
}