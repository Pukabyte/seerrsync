import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 errors (unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// --- Cache layer (stale-while-revalidate) ---
const CACHE_PREFIX = 'seerrsync_cache_'

export function getCached(key) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

function setCache(key, data) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data))
  } catch (e) {
    // Storage full — clear old cache entries and retry once
    console.warn(`Cache write failed for ${key}, clearing cache:`, e.message)
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_PREFIX + key)
      .forEach(k => sessionStorage.removeItem(k))
    try {
      sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data))
    } catch {}
  }
}

export function clearCache(key) {
  if (key) {
    sessionStorage.removeItem(CACHE_PREFIX + key)
  } else {
    // Clear all cache
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .forEach(k => sessionStorage.removeItem(k))
  }
}

// Wraps a GET call: caches the response data under the given key
function cachedGet(key, apiCall) {
  return apiCall().then(response => {
    setCache(key, response.data)
    return response
  })
}

export const getSeerr = () => cachedGet('seerr', () => api.get('/seerr'))
export const updateSeerr = (data) => api.put('/seerr', data)

export const getMediaServers = () => cachedGet('mediaservers', () => api.get('/mediaservers'))
export const getMediaServer = (name) => api.get(`/mediaservers/${name}`)
export const createMediaServer = (data) => api.post('/mediaservers', data)
export const updateMediaServer = (name, data) => api.put(`/mediaservers/${name}`, data)
export const deleteMediaServer = (name) => api.delete(`/mediaservers/${name}`)
export const getPlexServers = (token) => api.get('/plex/servers', { params: { token } })

export const getAllRequests = () => cachedGet('requests', () => api.get('/users/requests'))
export const getAllUsers = () => api.get('/users')
export const getDetailedUsers = () => cachedGet('detailed_users', () => api.get('/users/detailed'))
export const createUser = (userData) => api.post('/users', userData)
export const updateUserSettings = (username, settings) => api.put(`/users/${username}/settings`, settings)
export const triggerSync = () => api.post('/sync')

export const login = (username, password) => api.post('/auth/login', { username, password })
export const logout = () => { clearCache(); return api.post('/auth/logout') }
export const verifyAuth = () => api.get('/auth/verify')

export default api

