import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MdStorage, MdDelete, MdAdd, MdVisibility, MdVisibilityOff } from 'react-icons/md'
import { getSeerr, getMediaServers, triggerSync, createMediaServer, updateMediaServer, deleteMediaServer, getPlexServers, updateSeerr, getCached } from '../api'
import AnimatedNumber from '../components/AnimatedNumber'

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
          <h2 className="modal-title">{server ? `Edit ${server.name}` : 'Add Media Server'}</h2>
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

function SeerrConfigForm({ seerr, onClose, onSave }) {
  const [formData, setFormData] = useState({
    url: seerr?.url || '',
    api_key: seerr?.api_key || '',
    sync_interval_minutes: seerr?.sync_interval_minutes ?? ''
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    setFormData({
      url: seerr?.url || '',
      api_key: seerr?.api_key || '',
      sync_interval_minutes: seerr?.sync_interval_minutes ?? ''
    })
  }, [seerr])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const submitData = {
        ...formData,
        sync_interval_minutes: formData.sync_interval_minutes === '' ? null : formData.sync_interval_minutes
      }
      await updateSeerr(submitData)
      onSave()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update Seerr configuration')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Seerr Configuration</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {error && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="error">{error}</div>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">URL</label>
            <input
              type="url"
              className="form-input"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://jellyseerr.example.com"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">API Key</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                className="form-input"
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                placeholder="Your Seerr API key"
                required
                style={{ paddingRight: '3rem' }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '44px',
                  minHeight: '44px'
                }}
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
              >
                {showApiKey ? <MdVisibilityOff size={20} /> : <MdVisibility size={20} />}
              </button>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              You can find your API key in Seerr Settings → General Settings
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Sync Interval (minutes)</label>
            <input
              type="number"
              className="form-input"
              value={formData.sync_interval_minutes}
              onChange={(e) => setFormData({ ...formData, sync_interval_minutes: e.target.value ? parseInt(e.target.value) : '' })}
              placeholder="5"
              min="1"
            />
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              How often to automatically sync users (in minutes)
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Dashboard() {
  const cachedSeerr = getCached('seerr')
  const cachedServers = getCached('mediaservers')
  const [seerr, setSeerr] = useState(cachedSeerr)
  const [mediaServers, setMediaServers] = useState(cachedServers || [])
  const [initialLoading, setInitialLoading] = useState(!cachedSeerr)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState(null)

  const [showSeerrModal, setShowSeerrModal] = useState(false)
  const [showMediaServerModal, setShowMediaServerModal] = useState(false)
  const [editingServer, setEditingServer] = useState(null)
  const [deletingServer, setDeletingServer] = useState(null)
  const prevSeerrRef = useRef(null)
  const prevMediaServersRef = useRef([])

  const loadData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setInitialLoading(true)
      } else {
        setRefreshing(true)
      }
      
      const [seerrRes, serversRes] = await Promise.all([
        getSeerr(),
        getMediaServers()
      ])
      
      prevSeerrRef.current = seerr
      prevMediaServersRef.current = mediaServers
      
      setSeerr(seerrRes.data)
      setMediaServers(serversRes.data)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load dashboard data')
    } finally {
      if (isInitial) {
        setInitialLoading(false)
      } else {
        setTimeout(() => setRefreshing(false), 500)
      }
    }
  }, [])

  const handleSync = useCallback(async () => {
    try {
      setSyncing(true)
      setSyncMessage(null)
      setError(null)
      const response = await triggerSync()
      setSyncMessage(response.data.message || 'Sync completed successfully')
      await loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to sync users')
    } finally {
      setSyncing(false)
    }
  }, [loadData])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  useEffect(() => {
    if (syncMessage) {
      const timer = setTimeout(() => setSyncMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [syncMessage])

  const hasCachedData = Boolean(cachedSeerr)
  useEffect(() => {
    loadData(!hasCachedData)
    const interval = setInterval(() => loadData(false), 30000)
    return () => clearInterval(interval)
  }, [loadData, hasCachedData])

  useEffect(() => {
    // Show Seerr config modal if Seerr is not configured
    if (!initialLoading && (!seerr || !seerr.url)) {
      setShowSeerrModal(true)
    }
  }, [initialLoading, seerr])

  const handleDelete = async () => {
    if (!deletingServer) return
    
    try {
      await deleteMediaServer(deletingServer.name)
      setDeletingServer(null)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete media server')
    }
  }

  if (initialLoading) {
    return (
      <div className="container">
        <div className="dashboard-layout">
          <div style={{ width: '100%' }}>
            {/* Seerr & Statistics section */}
            <div className="section" style={{ marginBottom: '2.5rem' }}>
              <div className="section-header">
                <h2 className="section-title">Seerr & Statistics</h2>
              </div>
              <div className="grid" style={{ alignItems: 'stretch' }}>
                {/* Seerr card skeleton */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="card-header">
                    <div className="skeleton" style={{ width: '4rem', height: '1rem', borderRadius: '6px' }}></div>
                    <div className="skeleton" style={{ width: '10px', height: '10px', borderRadius: '50%' }}></div>
                  </div>
                  <div className="card-content" style={{ flex: 1 }}>
                    <div className="info-box">
                      <div className="skeleton" style={{ width: '75%', height: '1rem', borderRadius: '6px', marginBottom: '0.5rem' }}></div>
                      <div className="skeleton skeleton-text" style={{ width: '30%' }}></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '1rem' }}>
                      {['Users', 'Total Requests', 'Missing Requests', 'Media Items'].map(label => (
                        <div key={label} className="card-stat">
                          <div className="skeleton" style={{ width: '2.5rem', height: '1.25rem', borderRadius: '6px', marginBottom: '0.25rem' }}></div>
                          <span className="stat-label">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="card-actions">
                    <div className="skeleton" style={{ width: '90px', height: '32px', borderRadius: '8px' }}></div>
                    <div className="skeleton" style={{ width: '90px', height: '32px', borderRadius: '8px' }}></div>
                  </div>
                </div>
                {/* Summary stats card skeleton */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="stats-box" style={{ marginBottom: '0.75rem' }}>
                    <div className="skeleton" style={{ width: '4rem', height: '3.5rem', borderRadius: '8px', marginBottom: '0.5rem' }}></div>
                    <div className="stat-label" style={{ fontSize: '0.9rem' }}>Total Users</div>
                  </div>
                  <div className="stats-box" style={{ marginTop: 'auto' }}>
                    {['Media Servers', 'Enabled', 'Disabled', 'Seerr Users'].map(label => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                        <span className="stat-label" style={{ fontSize: '0.85rem' }}>{label}</span>
                        <div className="skeleton" style={{ width: '1.5rem', height: '1rem', borderRadius: '4px' }}></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Media Servers section */}
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">Media Servers</h2>
              </div>
              <div className="grid">
                {[1,2].map(i => (
                  <div key={i} className="card">
                    <div className="card-header">
                      <div className="skeleton" style={{ width: '8rem', height: '1rem', borderRadius: '6px' }}></div>
                      <div className="skeleton" style={{ width: '10px', height: '10px', borderRadius: '50%' }}></div>
                    </div>
                    <div className="card-content">
                      <div className="info-box">
                        <div className="skeleton" style={{ width: '70%', height: '0.875rem', borderRadius: '6px', marginBottom: '0.75rem' }}></div>
                        <div className="card-stat">
                          <div className="skeleton" style={{ width: '2rem', height: '1.25rem', borderRadius: '6px', marginBottom: '0.25rem' }}></div>
                          <span className="stat-label">Users</span>
                        </div>
                      </div>
                    </div>
                    <div className="card-actions">
                      <div className="skeleton" style={{ width: '60px', height: '32px', borderRadius: '8px' }}></div>
                      <div className="skeleton" style={{ width: '60px', height: '32px', borderRadius: '8px' }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const totalUsers = mediaServers.reduce((sum, server) => sum + (server.user_count || 0), 0)
  const enabledServers = mediaServers.filter(s => s.enabled).length
  const totalServers = mediaServers.length

  return (
    <div className="container">
      <div className="dashboard-layout">
        {(error || syncMessage) && (
          <div style={{ width: '100%', marginBottom: '1.5rem' }}>
            {error && <div className="error">{error}</div>}
            {syncMessage && <div className="success">{syncMessage}</div>}
          </div>
        )}
        <div style={{ width: '100%' }}>
          <div className="section" style={{ marginBottom: '2.5rem' }}>
            <div className="section-header">
              <h2 className="section-title">Seerr & Statistics</h2>
            </div>
            <div className="grid" style={{ alignItems: 'stretch' }}>
              <div className="card card-seerr" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="card-header">
                  <div className="card-title">Seerr</div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {seerr?.url ? (
                      seerr.user_count !== null ? (
                        <span className="status-icon status-icon-green" aria-label="Configured"></span>
                      ) : (
                        <span className="status-icon status-icon-yellow" aria-label="Configured with error"></span>
                      )
                    ) : (
                      <span className="status-icon status-icon-red" aria-label="Not Configured"></span>
                    )}
                  </div>
                </div>
                <div className="card-content" style={{ flex: 1 }}>
                  {seerr?.url ? (
                    <div>
                      <div className="info-box">
                        <div className="card-url">{seerr.url}</div>
                        {seerr.version && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            v{seerr.version}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '1rem' }}>
                        {seerr.user_count !== null && (
                          <div className="card-stat">
                            <AnimatedNumber value={seerr.user_count} className="stat-value" />
                            <span className="stat-label">Users</span>
                          </div>
                        )}
                        {seerr.total_requests !== null && seerr.total_requests !== undefined && (
                          <div className="card-stat">
                            <AnimatedNumber value={seerr.total_requests} className="stat-value" />
                            <span className="stat-label">Total Requests</span>
                          </div>
                        )}
                        {seerr.missing_requests !== null && seerr.missing_requests !== undefined && (
                          <div className="card-stat">
                            <AnimatedNumber value={seerr.missing_requests} className="stat-value" style={{ color: seerr.missing_requests > 0 ? 'var(--warning)' : 'inherit' }} />
                            <span className="stat-label">Missing Requests</span>
                          </div>
                        )}
                        {seerr.total_media_items !== null && seerr.total_media_items !== undefined && (
                          <div className="card-stat">
                            <AnimatedNumber value={seerr.total_media_items} className="stat-value" />
                            <span className="stat-label">Media Items</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>No Seerr instance configured</div>
                  )}
                </div>
                <div className="card-actions">
                  <button
                    onClick={handleSync}
                    className="btn btn-primary btn-small"
                    disabled={syncing || !seerr?.url || refreshing}
                  >
                    {syncing ? 'Syncing...' : 'Sync Users'}
                  </button>
                  <button
                    onClick={() => setShowSeerrModal(true)}
                    className="btn btn-secondary btn-small"
                  >
                    Configure
                  </button>
                </div>
              </div>
              <div className="card" style={{ position: 'relative', overflow: 'visible', display: 'flex', flexDirection: 'column' }}>
                <div className="stats-box" style={{ marginBottom: '0.75rem' }}>
                  <div className="stat-large" style={{ fontSize: '3.5rem' }}>
                    <AnimatedNumber value={totalUsers} />
                  </div>
                  <div className="stat-label" style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    Total Users
                  </div>
                </div>

                <div className="stats-box" style={{ marginTop: 'auto' }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span className="stat-label" style={{ fontSize: '0.85rem' }}>Media Servers</span>
                      <AnimatedNumber value={totalServers} className="stat-value" style={{ fontSize: '1.1rem' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span className="stat-label" style={{ fontSize: '0.85rem' }}>Enabled</span>
                      <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.9rem' }}>
                        <AnimatedNumber value={enabledServers} />
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="stat-label" style={{ fontSize: '0.85rem' }}>Disabled</span>
                      <span style={{ color: 'var(--error)', fontWeight: 600, fontSize: '0.9rem' }}>
                        <AnimatedNumber value={totalServers - enabledServers} />
                      </span>
                    </div>
                  </div>

                  {seerr?.user_count !== null && (
                    <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="stat-label" style={{ fontSize: '0.85rem' }}>Seerr Users</span>
                        <AnimatedNumber value={seerr.user_count} className="stat-value" style={{ fontSize: '1.1rem' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <h2 className="section-title">Media Servers</h2>
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
                          <AnimatedNumber value={server.user_count} className="stat-value" />
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
                        setShowMediaServerModal(true)
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn-small"
                      onClick={() => setDeletingServer(server)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      <MdDelete size={16} />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              <div 
                className="card card-add" 
                onClick={() => {
                  setEditingServer(null)
                  setShowMediaServerModal(true)
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="card-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div className="add-icon">
                      <MdAdd size={48} />
                    </div>
                    <div style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      Add Media Server
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSeerrModal && (
        <SeerrConfigForm
          seerr={seerr}
          onClose={() => setShowSeerrModal(false)}
          onSave={loadData}
        />
      )}

      {showMediaServerModal && (
        <MediaServerForm
          server={editingServer}
          onClose={() => {
            setShowMediaServerModal(false)
            setEditingServer(null)
          }}
          onSave={loadData}
        />
      )}

      {deletingServer && (
        <div className="modal-overlay" onClick={() => setDeletingServer(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete {deletingServer.name}?</h2>
              <button className="modal-close" onClick={() => setDeletingServer(null)}>×</button>
            </div>
            <div className="card-content">
              Are you sure you want to delete <strong>{deletingServer.name}?</strong> This action cannot be undone.
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

export default Dashboard
