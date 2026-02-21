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

  const SERVER_ICONS = {
    plex: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20512%20512%22%3E%3Cpath%20fill%3D%22%23e5a00d%22%20d%3D%22M256%2070H148l108%20186-108%20186h108l108-186z%22%20transform%3D%22translate%28256%2C256%29%20scale%281.38%29%20translate%28-256%2C-256%29%22%2F%3E%3C%2Fsvg%3E",
    jellyfin: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20xml%3Aspace%3D%22preserve%22%20viewBox%3D%220%200%20512%20512%22%3E%3ClinearGradient%20id%3D%22a%22%20x1%3D%2297.508%22%20x2%3D%22522.069%22%20y1%3D%22308.135%22%20y2%3D%2263.019%22%20gradientTransform%3D%22matrix%281%200%200%20-1%200%20514%29%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20offset%3D%220%22%20style%3D%22stop-color%3A%23aa5cc3%22%2F%3E%3Cstop%20offset%3D%221%22%20style%3D%22stop-color%3A%2300a4dc%22%2F%3E%3C%2FlinearGradient%3E%3Cpath%20d%3D%22M256%20196.2c-22.4%200-94.8%20131.3-83.8%20153.4s156.8%2021.9%20167.7%200-61.3-153.4-83.9-153.4%22%20style%3D%22fill%3Aurl%28%23a%29%22%2F%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%2294.193%22%20x2%3D%22518.754%22%20y1%3D%22302.394%22%20y2%3D%2257.278%22%20gradientTransform%3D%22matrix%281%200%200%20-1%200%20514%29%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20offset%3D%220%22%20style%3D%22stop-color%3A%23aa5cc3%22%2F%3E%3Cstop%20offset%3D%221%22%20style%3D%22stop-color%3A%2300a4dc%22%2F%3E%3C%2FlinearGradient%3E%3Cpath%20d%3D%22M256%200C188.3%200-29.8%20395.4%203.4%20462.2s472.3%2066%20505.2%200S323.8%200%20256%200m165.6%20404.3c-21.6%2043.2-309.3%2043.8-331.1%200S211.7%20101.4%20256%20101.4%20443.2%20361%20421.6%20404.3%22%20style%3D%22fill%3Aurl%28%23b%29%22%2F%3E%3C%2Fsvg%3E",
    emby: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20xml%3Aspace%3D%22preserve%22%20viewBox%3D%220%200%20512%20512%22%3E%3Cpath%20d%3D%22m97.1%20229.4%2026.5%2026.5L0%20379.5l132.4%20132.4%2026.5-26.5L282.5%20609l141.2-141.2-26.5-26.5L512%20326.5%20379.6%20194.1l-26.5%2026.5L229.5%2097z%22%20style%3D%22fill%3A%2352b54b%22%20transform%3D%22translate%280%20-97%29%22%2F%3E%3Cpath%20d%3D%22M196.8%20351.2v-193L366%20254.7%20281.4%20303z%22%20style%3D%22fill%3A%23fff%22%2F%3E%3C%2Fsvg%3E"
  }

  const getServerIcon = (serverType) => {
    const type = serverType?.toLowerCase()
    const iconSrc = SERVER_ICONS[type]
    if (!iconSrc) return null

    return (
      <img
        src={iconSrc}
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

