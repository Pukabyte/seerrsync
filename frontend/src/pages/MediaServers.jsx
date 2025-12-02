import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getMediaServers, createMediaServer, updateMediaServer, deleteMediaServer, getPlexServers } from '../api'

function MediaServerForm({ server, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: server?.name || '',
    type: server?.type || 'plex',
    url: server?.url || '',
    token: server?.token || '',
    enabled: server?.enabled ?? true,
    password_suffix: server?.password_suffix || '',
    request_limit: server?.request_limit || '',
    machine_identifier: server?.machine_identifier || ''
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [plexServers, setPlexServers] = useState([])
  const [loadingPlexServers, setLoadingPlexServers] = useState(false)

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  useEffect(() => {
    const fetchPlexServers = async () => {
      if (formData.type === 'plex' && formData.token) {
        setLoadingPlexServers(true)
        try {
          const response = await getPlexServers(formData.token)
          setPlexServers(response.data || [])
        } catch (err) {
          setPlexServers([])
        } finally {
          setLoadingPlexServers(false)
        }
      } else {
        setPlexServers([])
      }
    }

    const timer = setTimeout(fetchPlexServers, 500)
    return () => clearTimeout(timer)
  }, [formData.type, formData.token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const data = {
        ...formData,
        request_limit: formData.request_limit ? parseInt(formData.request_limit) : null,
        machine_identifier: formData.machine_identifier || null
      }
      
      if (server) {
        await updateMediaServer(server.name, data)
      } else {
        await createMediaServer(data)
      }
      onSave()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save media server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{server ? 'Edit Media Server' : 'Add Media Server'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {error && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="error">{error}</div>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={!!server}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select
              className="form-select"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
              disabled={!!server}
            >
              <option value="plex">Plex</option>
              <option value="jellyfin">Jellyfin</option>
              <option value="emby">Emby</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">URL</label>
            <input
              type="url"
              className="form-input"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Token / API Key</label>
            <input
              type="text"
              className="form-input"
              value={formData.token}
              onChange={(e) => setFormData({ ...formData, token: e.target.value })}
              required
            />
          </div>
          {formData.type === 'plex' && (
            <div className="form-group">
              <label className="form-label">Plex Server (optional)</label>
              {!formData.token ? (
                <div className="form-input" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Enter a token above to see available servers
                </div>
              ) : loadingPlexServers ? (
                <div className="form-input" style={{ color: 'var(--text-secondary)' }}>
                  Loading servers...
                </div>
              ) : plexServers.length > 0 ? (
                <select
                  className="form-select"
                  value={formData.machine_identifier || ''}
                  onChange={(e) => setFormData({ ...formData, machine_identifier: e.target.value || '' })}
                >
                  <option value="">All users (no filter)</option>
                  {plexServers.map((plexServer) => (
                    <option key={plexServer.machineIdentifier} value={plexServer.machineIdentifier}>
                      {plexServer.name} ({plexServer.machineIdentifier})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="form-input" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  No servers found or invalid token
                </div>
              )}
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Password Suffix</label>
            <input
              type="text"
              className="form-input"
              value={formData.password_suffix}
              onChange={(e) => setFormData({ ...formData, password_suffix: e.target.value })}
              placeholder="e.g., -request"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Request Limit (optional)</label>
            <input
              type="number"
              className="form-input"
              value={formData.request_limit}
              onChange={(e) => setFormData({ ...formData, request_limit: e.target.value })}
              placeholder="Leave empty for no limit"
            />
          </div>
          <div className="form-group">
            <div className="form-checkbox">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              />
              <label className="form-label" style={{ margin: 0 }}>Enabled</label>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MediaServers() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [mediaServers, setMediaServers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingServer, setEditingServer] = useState(null)
  const [deletingServer, setDeletingServer] = useState(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  useEffect(() => {
    loadServers()
    const editName = searchParams.get('edit')
    if (editName) {
      const server = mediaServers.find(s => s.name === editName)
      if (server) {
        setEditingServer(server)
        setShowForm(true)
      }
    }
    const interval = setInterval(loadServers, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const editName = searchParams.get('edit')
    if (editName && mediaServers.length > 0) {
      const server = mediaServers.find(s => s.name === editName)
      if (server) {
        setEditingServer(server)
        setShowForm(true)
        setSearchParams({})
      }
    }
  }, [mediaServers, searchParams, setSearchParams])

  const loadServers = async () => {
    try {
      const response = await getMediaServers()
      setMediaServers(response.data)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load media servers')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingServer) return
    
    try {
      await deleteMediaServer(deletingServer.name)
      setDeletingServer(null)
      loadServers()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete media server')
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading">
          <img 
            src="/assets/seerrsync.svg" 
            alt="SeerrSync" 
            className={`loading-logo ${imageLoaded ? 'loaded' : ''}`}
            onLoad={() => setImageLoaded(true)}
          />
          <div className="loading-text">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Media Servers</h1>
      </div>

      {error && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div className="error">{error}</div>
        </div>
      )}

      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Configured Servers</h2>
        </div>

        <div className="grid">
          {mediaServers.map((server) => (
              <div key={server.name} className={`card card-${server.type.toLowerCase()}`}>
                <div className="card-header">
                  <div className="card-title">{server.name}</div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {server.enabled ? (
                      server.user_count !== null ? (
                        <span className="status-icon status-icon-green" aria-label="Enabled"></span>
                      ) : (
                        <span className="status-icon status-icon-yellow" aria-label="Enabled with error"></span>
                      )
                    ) : (
                      <span className="status-icon status-icon-red" aria-label="Disabled"></span>
                    )}
                  </div>
                </div>
                <div className="card-content">
                  <div className="info-box">
                    <div className="card-url">
                      {server.url}
                    </div>
                    {server.user_count !== null && (
                      <div className="card-stat">
                        <span className="stat-value">{server.user_count}</span>
                        <span className="stat-label">Users</span>
                      </div>
                    )}
                    {server.user_count === null && server.enabled && (
                      <div className="card-stat">
                        <span className="stat-label" style={{ color: 'var(--warning)' }}>
                          Unable to fetch user count
                        </span>
                      </div>
                    )}
                  </div>
                  {server.password_suffix && (
                    <div className="card-meta" style={{ marginTop: '0.75rem' }}>
                      <span className="card-meta-label">Password suffix:</span>
                      <span className="card-meta-value">{server.password_suffix}</span>
                    </div>
                  )}
                  {server.request_limit && (
                    <div className="card-meta" style={{ marginTop: '0.5rem' }}>
                      <span className="card-meta-label">Request limit:</span>
                      <span className="card-meta-value">{server.request_limit}</span>
                    </div>
                  )}
                </div>
                <div className="card-actions">
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => {
                      setEditingServer(server)
                      setShowForm(true)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger btn-small"
                    onClick={() => setDeletingServer(server)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            <div 
              className="card card-add" 
              onClick={() => {
                setEditingServer(null)
                setShowForm(true)
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className="card-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="add-icon">+</div>
                  <div style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Add Media Server
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>

      {showForm && (
        <MediaServerForm
          server={editingServer}
          onClose={() => {
            setShowForm(false)
            setEditingServer(null)
          }}
          onSave={loadServers}
        />
      )}

      {deletingServer && (
        <div className="modal-overlay" onClick={() => setDeletingServer(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Media Server</h2>
              <button className="modal-close" onClick={() => setDeletingServer(null)}>×</button>
            </div>
            <div className="card-content">
              Are you sure you want to delete <strong>{deletingServer.name}</strong>? This action cannot be undone.
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeletingServer(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MediaServers

