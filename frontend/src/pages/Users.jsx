import React, { useState, useEffect } from 'react'
import { MdPeople, MdBlock, MdShield, MdLock, MdCheck, MdClose, MdEdit, MdVisibility, MdVisibilityOff, MdFilterList, MdAdd } from 'react-icons/md'
import { getDetailedUsers, updateUserSettings, createUser, getCached } from '../api'
import AnimatedNumber from '../components/AnimatedNumber'

function UserSettingsModal({ user, onClose, onSave }) {
  const [formData, setFormData] = useState({
    blocked: user?.blocked || false,
    immune: user?.immune || false,
    password: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

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
      const settings = {}
      if (formData.blocked !== user?.blocked) {
        settings.blocked = formData.blocked
      }
      if (formData.immune !== user?.immune) {
        settings.immune = formData.immune
      }
      if (formData.password) {
        settings.password = formData.password
      }

      if (Object.keys(settings).length > 0) {
        await updateUserSettings(user.username, settings)
        onSave()
        onClose()
      } else {
        onClose()
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update user settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">User Settings: {user?.username}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {error && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="error">{error}</div>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <div className="form-checkbox">
              <input
                type="checkbox"
                checked={formData.blocked}
                onChange={(e) => setFormData({ ...formData, blocked: e.target.checked })}
              />
              <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MdBlock size={18} />
                Block from sync
              </label>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem', marginLeft: '1.75rem' }}>
              Prevents this user from being synced to Overseerr
            </div>
          </div>

          <div className="form-group">
            <div className="form-checkbox">
              <input
                type="checkbox"
                checked={formData.immune}
                onChange={(e) => setFormData({ ...formData, immune: e.target.checked })}
              />
              <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MdShield size={18} />
                Immune from deletion
              </label>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem', marginLeft: '1.75rem' }}>
              Prevents this user from being deleted during sync operations
            </div>
          </div>

          {user?.synced_to_overseerr && (
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MdLock size={18} />
                Change Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Leave empty to keep current password"
                  style={{ paddingRight: '3rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
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
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <MdVisibilityOff size={20} /> : <MdVisibility size={20} />}
                </button>
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddUserModal({ onClose, onSave }) {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    permissions: 0,
    request_limit: '',
    blocked: false,
    immune: false
  })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Permission values (bitmask)
  const permissionOptions = [
    { value: 1, label: 'Administrator', description: 'Full access to all features and settings' },
    { value: 2, label: 'Auto-Approve', description: 'Requests are automatically approved' },
    { value: 4, label: 'Request', description: 'Can make media requests (requires approval)' },
    { value: 8, label: 'Request Movies', description: 'Can request movies' },
    { value: 16, label: 'Request TV', description: 'Can request TV shows' },
    { value: 32, label: 'Request 4K', description: 'Can request 4K content' },
    { value: 64, label: 'Request Advanced', description: 'Advanced request features' },
    { value: 128, label: 'Manage Users', description: 'Can manage other users' },
    { value: 256, label: 'Manage Requests', description: 'Can manage all requests' },
    { value: 512, label: 'Manage Issues', description: 'Can manage issues' },
    { value: 1024, label: 'Manage Settings', description: 'Can manage Overseerr settings' }
  ]

  const togglePermission = (value) => {
    const newPermissions = formData.permissions ^ value
    setFormData({ ...formData, permissions: newPermissions })
  }

  const hasPermission = (value) => {
    return (formData.permissions & value) !== 0
  }

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
      const userData = {
        username: formData.username,
        password: formData.password || undefined,
        permissions: parseInt(formData.permissions) || 0,
        request_limit: formData.request_limit ? parseInt(formData.request_limit) : undefined,
        blocked: formData.blocked,
        immune: formData.immune
      }

      await createUser(userData)
      onSave()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add New User</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {error && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="error">{error}</div>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username *</label>
            <input
              type="text"
              className="form-input"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="Enter username"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MdLock size={18} />
              Password *
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Enter password"
                required
                style={{ paddingRight: '3rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
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
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <MdVisibilityOff size={20} /> : <MdVisibility size={20} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Permissions</label>
            <div style={{ 
              border: '1px solid var(--border-color)', 
              borderRadius: '8px', 
              padding: '1rem',
              backgroundColor: 'var(--card-bg)',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              {permissionOptions.map((perm) => (
                <div key={perm.value} style={{ marginBottom: '0.75rem' }}>
                  <div className="form-checkbox" style={{ marginBottom: '0.25rem' }}>
                    <input
                      type="checkbox"
                      checked={hasPermission(perm.value)}
                      onChange={() => togglePermission(perm.value)}
                      disabled={perm.value === 1 && hasPermission(1)}
                    />
                    <label 
                      className="form-label" 
                      style={{ 
                        margin: 0, 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      {perm.label}
                    </label>
                  </div>
                  <div style={{ 
                    fontSize: '0.85rem', 
                    color: 'var(--text-secondary)', 
                    marginLeft: '1.75rem',
                    marginTop: '0.25rem'
                  }}>
                    {perm.description}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              {formData.permissions === 0 
                ? "No special permissions. User has basic access only."
                : `Selected permissions value: ${formData.permissions}`
              }
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Request Limit</label>
            <input
              type="number"
              className="form-input"
              value={formData.request_limit}
              onChange={(e) => setFormData({ ...formData, request_limit: e.target.value })}
              placeholder="Leave empty for no limit"
              min="0"
            />
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Maximum number of requests for movies and TV shows
            </div>
          </div>

          <div className="form-group">
            <div className="form-checkbox">
              <input
                type="checkbox"
                checked={formData.blocked}
                onChange={(e) => setFormData({ ...formData, blocked: e.target.checked })}
              />
              <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MdBlock size={18} />
                Block from sync
              </label>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem', marginLeft: '1.75rem' }}>
              Prevents this user from being synced to Overseerr
            </div>
          </div>

          <div className="form-group">
            <div className="form-checkbox">
              <input
                type="checkbox"
                checked={formData.immune}
                onChange={(e) => setFormData({ ...formData, immune: e.target.checked })}
              />
              <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MdShield size={18} />
                Immune from deletion
              </label>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem', marginLeft: '1.75rem' }}>
              Prevents this user from being deleted during sync operations
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Users() {
  const cachedUsers = getCached('detailed_users')
  const [users, setUsers] = useState(cachedUsers?.users || [])
  const [loading, setLoading] = useState(!cachedUsers)
  const [error, setError] = useState(null)

  const [editingUser, setEditingUser] = useState(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    syncStatus: null,
    blocked: null,
    immune: null,
    server: null
  })

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  useEffect(() => {
    loadUsers()
    const interval = setInterval(loadUsers, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadUsers = async () => {
    try {
      const response = await getDetailedUsers()
      setUsers(response.data.users || [])
      setError(null)
    } catch (err) {
      const errorDetail = err.response?.data?.detail || 'Failed to load users'
      setError(errorDetail)
    } finally {
      setLoading(false)
    }
  }

  const allServers = Array.from(new Set(users.flatMap(u => u.source_servers || []))).sort()

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const matchesSyncStatus = filters.syncStatus === null || 
      (filters.syncStatus === 'synced' && user.synced_to_overseerr) ||
      (filters.syncStatus === 'not_synced' && !user.synced_to_overseerr)
    
    const matchesBlocked = filters.blocked === null ||
      (filters.blocked === true && user.blocked) ||
      (filters.blocked === false && !user.blocked)
    
    const matchesImmune = filters.immune === null ||
      (filters.immune === true && user.immune) ||
      (filters.immune === false && !user.immune)
    
    const matchesServer = filters.server === null ||
      (user.source_servers && user.source_servers.includes(filters.server))
    
    return matchesSearch && matchesSyncStatus && matchesBlocked && matchesImmune && matchesServer
  })

  const activeFiltersCount = Object.values(filters).filter(v => v !== null).length
  const hasActiveFilters = activeFiltersCount > 0

  const stats = {
    total: users.length,
    synced: users.filter(u => u.synced_to_overseerr).length,
    blocked: users.filter(u => u.blocked).length,
    immune: users.filter(u => u.immune).length,
    totalRequests: users.reduce((sum, u) => sum + (u.request_count || 0), 0)
  }

  if (loading) {
    return (
      <div className="container">
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title">Users</h1>
            <p className="page-subtitle">Manage users from all media servers</p>
          </div>
        </div>

        {/* Stats skeleton - matches the 5 stat cards */}
        <div className="section" style={{ marginBottom: '2rem' }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {['Total Users', 'Synced to Overseerr', 'Blocked', 'Immune', 'Total Requests'].map(label => (
              <div key={label} className="card">
                <div className="card-content">
                  <div className="skeleton" style={{ width: '3rem', height: '2.5rem', borderRadius: '8px', marginBottom: '0.5rem' }}></div>
                  <div className="stat-label">{label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search bar skeleton */}
        <div className="section">
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div className="skeleton" style={{ width: '100%', height: '42px', borderRadius: '8px' }}></div>
            </div>
          </div>

          {/* User cards skeleton - matches actual card layout */}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.5rem' }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Header - username + sync icon */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: '55%', height: '1.375rem', marginBottom: '0.5rem', borderRadius: '6px' }}></div>
                    <div className="skeleton skeleton-text" style={{ width: '40%' }}></div>
                  </div>
                  <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '12px', flexShrink: 0 }}></div>
                </div>
                {/* Stats box - 2x2 grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', padding: '1rem', background: 'rgba(180, 150, 230, 0.05)', borderRadius: '16px', border: '1px solid rgba(180, 150, 230, 0.1)' }}>
                  {[1,2].map(j => (
                    <div key={j} style={{ textAlign: 'center' }}>
                      <div className="skeleton" style={{ width: '2rem', height: '2rem', borderRadius: '8px', margin: '0 auto 0.25rem' }}></div>
                      <div className="skeleton skeleton-text" style={{ width: '60%', margin: '0 auto' }}></div>
                    </div>
                  ))}
                </div>
                {/* Details rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div className="skeleton skeleton-text" style={{ width: '70%' }}></div>
                  <div className="skeleton skeleton-text" style={{ width: '50%' }}></div>
                  <div className="skeleton skeleton-text" style={{ width: '60%' }}></div>
                </div>
                {/* Edit button */}
                <div className="skeleton" style={{ width: '100%', height: '36px', borderRadius: '12px' }}></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">
            Manage users from all media servers
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddUser(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            borderRadius: '12px'
          }}
        >
          <MdAdd size={20} />
          Add User
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div className="error">{error}</div>
        </div>
      )}

      <div className="section" style={{ marginBottom: '2rem' }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div className="card">
            <div className="card-content">
              <div className="stat-large" style={{ fontSize: '2.5rem' }}>
                <AnimatedNumber value={stats.total} />
              </div>
              <div className="stat-label">Total Users</div>
            </div>
          </div>
          <div className="card">
            <div className="card-content">
              <div className="stat-large" style={{ fontSize: '2.5rem', color: 'var(--success)' }}>
                <AnimatedNumber value={stats.synced} />
              </div>
              <div className="stat-label">Synced to Overseerr</div>
            </div>
          </div>
          <div className="card">
            <div className="card-content">
              <div className="stat-large" style={{ fontSize: '2.5rem', color: 'var(--error)' }}>
                <AnimatedNumber value={stats.blocked} />
              </div>
              <div className="stat-label">Blocked</div>
            </div>
          </div>
          <div className="card">
            <div className="card-content">
              <div className="stat-large" style={{ fontSize: '2.5rem', color: 'var(--warning)' }}>
                <AnimatedNumber value={stats.immune} />
              </div>
              <div className="stat-label">Immune</div>
            </div>
          </div>
          <div className="card">
            <div className="card-content">
              <div className="stat-large" style={{ fontSize: '2.5rem' }}>
                <AnimatedNumber value={stats.totalRequests} />
              </div>
              <div className="stat-label">Total Requests</div>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <button
              className={`btn btn-small ${hasActiveFilters ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowFilters(!showFilters)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <MdFilterList size={18} />
              Filters
              {hasActiveFilters && (
                <span style={{
                  background: 'var(--error)',
                  color: 'white',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}>
                  {activeFiltersCount}
                </span>
              )}
            </button>
            {showFilters && (
              <div 
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '0.5rem',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  minWidth: '250px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  zIndex: 1000
                }}
              >
                <div style={{ marginBottom: '1rem', fontWeight: 600 }}>Filter Users</div>
                
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Sync Status</label>
                  <select
                    className="form-select"
                    value={filters.syncStatus || ''}
                    onChange={(e) => setFilters({ ...filters, syncStatus: e.target.value || null })}
                  >
                    <option value="">All</option>
                    <option value="synced">Synced</option>
                    <option value="not_synced">Not Synced</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Blocked</label>
                  <select
                    className="form-select"
                    value={filters.blocked === null ? '' : filters.blocked ? 'true' : 'false'}
                    onChange={(e) => setFilters({ ...filters, blocked: e.target.value === '' ? null : e.target.value === 'true' })}
                  >
                    <option value="">All</option>
                    <option value="true">Blocked</option>
                    <option value="false">Not Blocked</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Immune</label>
                  <select
                    className="form-select"
                    value={filters.immune === null ? '' : filters.immune ? 'true' : 'false'}
                    onChange={(e) => setFilters({ ...filters, immune: e.target.value === '' ? null : e.target.value === 'true' })}
                  >
                    <option value="">All</option>
                    <option value="true">Immune</option>
                    <option value="false">Not Immune</option>
                  </select>
                </div>

                {allServers.length > 0 && (
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="form-label" style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Server</label>
                    <select
                      className="form-select"
                      value={filters.server || ''}
                      onChange={(e) => setFilters({ ...filters, server: e.target.value || null })}
                    >
                      <option value="">All Servers</option>
                      {allServers.map(server => (
                        <option key={server} value={server}>{server}</option>
                      ))}
                    </select>
                  </div>
                )}

                {hasActiveFilters && (
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => setFilters({ syncStatus: null, blocked: null, immune: null, server: null })}
                    style={{ width: '100%' }}
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {showFilters && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999
            }}
            onClick={() => setShowFilters(false)}
          />
        )}

        {filteredUsers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <MdPeople />
            </div>
            <div>No users found</div>
          </div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.5rem' }}>
            {filteredUsers.map((user) => (
              <div key={user.username} className="card" style={{ 
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem'
              }}>
                {/* Header Section */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem'}}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.75rem',
                      marginBottom: '0.5rem',
                      flexWrap: 'wrap'
                    }}>
                      <h3 style={{ 
                        fontSize: '1.375rem', 
                        fontWeight: 700, 
                        color: 'var(--text-primary)',
                        margin: 0,
                        letterSpacing: '-0.02em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {user.username}
                      </h3>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                        {user.blocked && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.625rem',
                            background: 'rgba(255, 68, 68, 0.15)',
                            border: '1px solid rgba(255, 68, 68, 0.3)',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--error)',
                            backdropFilter: 'blur(10px)'
                          }} title="Blocked from sync">
                            <MdBlock size={14} />
                            Blocked
                          </span>
                        )}
                        {user.immune && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.625rem',
                            background: 'rgba(255, 170, 0, 0.15)',
                            border: '1px solid rgba(255, 170, 0, 0.3)',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--warning)',
                            backdropFilter: 'blur(10px)'
                          }} title="Immune from deletion">
                            <MdShield size={14} />
                            Immune
                          </span>
                        )}
                      </div>
                    </div>
                    {user.email && (
                      <div style={{ 
                        fontSize: '0.875rem', 
                        color: 'var(--text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {user.email}
                      </div>
                    )}
                  </div>
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: user.synced_to_overseerr 
                      ? 'rgba(0, 255, 136, 0.15)' 
                      : 'rgba(255, 68, 68, 0.15)',
                    border: `1px solid ${user.synced_to_overseerr ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 68, 68, 0.3)'}`,
                    flexShrink: 0
                  }}>
                    {user.synced_to_overseerr ? (
                      <MdCheck size={20} style={{ color: 'var(--success)' }} />
                    ) : (
                      <MdClose size={20} style={{ color: 'var(--error)' }} />
                    )}
                  </div>
                </div>

                {/* Stats Section */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(2, 1fr)', 
                  gap: '1rem',
                  padding: '1rem',
                  background: 'rgba(180, 150, 230, 0.05)',
                  borderRadius: '16px',
                  border: '1px solid rgba(180, 150, 230, 0.1)'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                      fontSize: '2rem', 
                      fontWeight: 700,
                      lineHeight: 1,
                      marginBottom: '0.25rem',
                      minHeight: '2rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <AnimatedNumber 
                        value={user.request_count ?? 0} 
                        style={{
                          background: 'var(--gradient-purple)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text'
                        }}
                      />
                    </div>
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Requests
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                      fontSize: '2rem', 
                      fontWeight: 700,
                      lineHeight: 1,
                      marginBottom: '0.25rem',
                      minHeight: '2rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <AnimatedNumber 
                        value={user.missing_requests ?? 0}
                        style={{
                          background: (user.missing_requests ?? 0) > 0 
                            ? 'linear-gradient(135deg, #ff6b6b 0%, #ff8787 100%)'
                            : 'var(--gradient-blue)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text'
                        }}
                      />
                    </div>
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: (user.missing_requests ?? 0) > 0 ? 'var(--error)' : 'var(--text-secondary)',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Missing
                    </div>
                  </div>
                </div>

                {/* Metadata Section */}
                {(user.source_servers?.length > 0 || user.source_types?.length > 0 || user.password_suffix || (user.request_limit !== null && user.request_limit !== undefined)) && (
                  <div style={{ 
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    padding: '1rem',
                    background: 'rgba(26, 26, 42, 0.4)',
                    borderRadius: '12px',
                    border: '1px solid rgba(180, 150, 230, 0.1)'
                  }}>
                    {user.source_servers && user.source_servers.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          minWidth: '80px',
                          flexShrink: 0
                        }}>Servers</span>
                        <span style={{ 
                          fontSize: '0.875rem', 
                          color: 'var(--text-primary)',
                          fontWeight: 500
                        }}>{user.source_servers.join(', ')}</span>
                      </div>
                    )}
                    {user.source_types && user.source_types.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          minWidth: '80px',
                          flexShrink: 0
                        }}>Types</span>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {user.source_types.map((type, idx) => (
                            <span key={idx} style={{
                              padding: '0.25rem 0.625rem',
                              background: 'rgba(180, 150, 230, 0.1)',
                              border: '1px solid rgba(180, 150, 230, 0.2)',
                              borderRadius: '8px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: 'var(--accent)',
                              textTransform: 'capitalize'
                            }}>
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {user.password_suffix && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          minWidth: '80px',
                          flexShrink: 0
                        }}>Password</span>
                        <span style={{ 
                          fontSize: '0.875rem', 
                          color: 'var(--text-primary)',
                          fontWeight: 500,
                          fontFamily: 'monospace',
                          background: 'rgba(180, 150, 230, 0.1)',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '6px'
                        }}>{user.password_suffix}</span>
                      </div>
                    )}
                    {user.request_limit !== null && user.request_limit !== undefined && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          minWidth: '80px',
                          flexShrink: 0
                        }}>Limit</span>
                        <span style={{ 
                          fontSize: '0.875rem', 
                          color: 'var(--text-primary)',
                          fontWeight: 600
                        }}>{user.request_limit}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions Section */}
                <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setEditingUser(user)}
                    style={{ 
                      width: '100%',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem 1rem',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      borderRadius: '12px',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <MdEdit size={18} />
                    Manage Settings
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingUser && (
        <UserSettingsModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={loadUsers}
        />
      )}

      {showAddUser && (
        <AddUserModal
          onClose={() => setShowAddUser(false)}
          onSave={loadUsers}
        />
      )}
    </div>
  )
}

export default Users

