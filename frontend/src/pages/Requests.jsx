import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MdList } from 'react-icons/md'
import { getAllRequests, getCached } from '../api'

function Requests() {
  const navigate = useNavigate()
  const cachedRequests = getCached('requests')
  const [requestsData, setRequestsData] = useState(cachedRequests || null)
  const [loading, setLoading] = useState(!cachedRequests)
  const [error, setError] = useState(null)
  const [expandedUsers, setExpandedUsers] = useState(new Set())


  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  useEffect(() => {
    loadRequests()
    const interval = setInterval(loadRequests, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadRequests = async () => {
    try {
      const response = await getAllRequests()
      setRequestsData(response.data)
      setError(null)
    } catch (err) {
      const errorDetail = err.response?.data?.detail || 'Failed to load requests'
      setError(errorDetail)
      // Redirect to Dashboard if Seerr is not configured
      if (err.response?.status === 400 && errorDetail.includes('Seerr not configured')) {
        navigate('/')
      }
    } finally {
      setLoading(false)
    }
  }

  const toggleUser = (userId) => {
    const newExpanded = new Set(expandedUsers)
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId)
    } else {
      newExpanded.add(userId)
    }
    setExpandedUsers(newExpanded)
  }

  const getStatusBadge = (status) => {
    const statusMap = {
      1: { text: 'Pending', class: 'badge-warning' },
      2: { text: 'Approved', class: 'badge-enabled' },
      3: { text: 'Declined', class: 'badge-disabled' },
      4: { text: 'Available', class: 'badge-enabled' },
      5: { text: 'Partially Available', class: 'badge-warning' },
      6: { text: 'Processing', class: 'badge-warning' },
      7: { text: 'Unavailable', class: 'badge-disabled' },
      8: { text: 'Failed', class: 'badge-disabled' }
    }
    const statusInfo = statusMap[status] || { text: 'Unknown', class: '' }
    return (
      <span className={`card-badge ${statusInfo.class}`} style={{ fontSize: '0.75rem' }}>
        {statusInfo.text}
      </span>
    )
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  const getServerIcon = (serverType) => {
    const type = serverType?.toLowerCase()
    const iconMap = {
      plex: '/assets/plex.svg',
      jellyfin: '/assets/jellyfin.svg',
      emby: '/assets/emby.svg'
    }
    const iconPath = iconMap[type]
    if (!iconPath) return null
    
    return (
      <img 
        src={iconPath} 
        alt={type} 
        style={{ width: '16px', height: '16px', display: 'inline-block' }}
      />
    )
  }


  if (loading) {
    return (
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">User Requests</h1>
          <p className="page-subtitle">All requests organized by user</p>
        </div>
        <div className="section">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="collapsible">
              <div className="collapsible-header" style={{ pointerEvents: 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <div className="skeleton" style={{ width: '16px', height: '16px', borderRadius: '4px' }}></div>
                    <div className="skeleton" style={{ width: `${20 + i * 8}%`, height: '1rem', borderRadius: '6px' }}></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="skeleton skeleton-text" style={{ width: '80px' }}></div>
                    <div className="skeleton skeleton-text" style={{ width: '120px' }}></div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div className="skeleton" style={{ width: '2rem', height: '1.25rem', borderRadius: '6px' }}></div>
                  <div className="skeleton" style={{ width: '12px', height: '12px', borderRadius: '3px' }}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }


  const requestsByUser = requestsData?.requests_by_user || {}
  const userEntries = Object.entries(requestsByUser)

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">User Requests</h1>
        <p className="page-subtitle">
          All requests organized by user ({requestsData?.total_requests || 0} total)
        </p>
      </div>

      {error && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div className="error">{error}</div>
        </div>
      )}

      {userEntries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <MdList />
          </div>
          <div>No requests found</div>
        </div>
      ) : (
        <div className="section">
          {userEntries.map(([userId, data]) => {
            const user = data.user
            const requests = data.requests
            const isExpanded = expandedUsers.has(parseInt(userId))

            return (
              <div key={userId} className="collapsible">
                <div
                  className="collapsible-header"
                  onClick={() => toggleUser(parseInt(userId))}
                >
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {user.source_types && user.source_types.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          {user.source_types.map((type, idx) => (
                            <span key={idx} style={{ display: 'flex', alignItems: 'center' }} title={type}>
                              {getServerIcon(type)}
                            </span>
                          ))}
                        </div>
                      )}
                      <span>{user.username || user.email || `User ${userId}`}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {requests.length} request{requests.length !== 1 ? 's' : ''}
                      {user.source_servers && user.source_servers.length > 0 && (
                        <span style={{ marginLeft: '0.5rem' }}>
                          • {user.source_servers.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span className="stat-value" style={{ fontSize: '1.25rem' }}>
                      {requests.length}
                    </span>
                    <span
                      className="collapsible-icon"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      ▼
                    </span>
                  </div>
                </div>
                {isExpanded && (
                  <div className="collapsible-content">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Title</th>
                          <th>Status</th>
                          <th>Requested</th>
                          <th>Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requests.map((req) => (
                          <tr key={req.id}>
                            <td>
                              <span className={`card-badge ${req.mediaType === 'movie' ? 'badge-plex' : 'badge-jellyfin'}`} style={{ fontSize: '0.75rem' }}>
                                {req.mediaType}
                              </span>
                            </td>
                            <td>
                              {req.media?.title || req.media?.name || 'Unknown'}
                              {req.media?.releaseDate && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  {new Date(req.media.releaseDate).getFullYear()}
                                </div>
                              )}
                            </td>
                            <td>{getStatusBadge(req.status)}</td>
                            <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                              {formatDate(req.createdAt)}
                            </td>
                            <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                              {formatDate(req.updatedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Requests

