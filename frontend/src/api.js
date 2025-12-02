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

export const getSeerr = () => api.get('/seerr')
export const updateSeerr = (data) => api.put('/seerr', data)

export const getMediaServers = () => api.get('/mediaservers')
export const getMediaServer = (name) => api.get(`/mediaservers/${name}`)
export const createMediaServer = (data) => api.post('/mediaservers', data)
export const updateMediaServer = (name, data) => api.put(`/mediaservers/${name}`, data)
export const deleteMediaServer = (name) => api.delete(`/mediaservers/${name}`)
export const getPlexServers = (token) => api.get('/plex/servers', { params: { token } })

export const getAllRequests = () => api.get('/users/requests')
export const getAllUsers = () => api.get('/users')
export const getDetailedUsers = () => api.get('/users/detailed')
export const createUser = (userData) => api.post('/users', userData)
export const updateUserSettings = (username, settings) => api.put(`/users/${username}/settings`, settings)
export const triggerSync = () => api.post('/sync')

export const login = (username, password) => api.post('/auth/login', { username, password })
export const logout = () => api.post('/auth/logout')
export const verifyAuth = () => api.get('/auth/verify')

export default api

