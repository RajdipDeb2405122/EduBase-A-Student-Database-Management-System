const API_BASE = '/api'

const getHeaders = () => {
  const token = localStorage.getItem('edubase_token')
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  }
}

const handleResponse = async (response) => {
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong')
  }
  return { data, response }
}

const api = {
  get: async (endpoint) => {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers: getHeaders()
    })
    return handleResponse(response)
  },

  post: async (endpoint, body) => {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body)
    })
    return handleResponse(response)
  },

  put: async (endpoint, body) => {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(body)
    })
    return handleResponse(response)
  },

  delete: async (endpoint) => {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: getHeaders()
    })
    return handleResponse(response)
  }
}

export default api
