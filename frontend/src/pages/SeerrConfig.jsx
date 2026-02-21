import React, { useState, useEffect } from 'react'
import { MdVisibility, MdVisibilityOff } from 'react-icons/md'
import { getSeerr, updateSeerr } from '../api'

function SeerrConfig() {
  const [seerr, setSeerr] = useState({ url: '', api_key: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const loadConfig = async () => {
    try {
      const response = await getSeerr()
      setSeerr({
        url: response.data.url || '',
        api_key: response.data.api_key || ''
      })
      setError(null)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load Seerr configuration')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      await updateSeerr(seerr)
      setSuccess('Seerr configuration updated successfully')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update Seerr configuration')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading">
          <img 
            src="/assets/seerrsync.webp" 
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
        <h1 className="page-title">Seerr Configuration</h1>
      </div>

      {(error || success) && (
        <div style={{ marginBottom: '1.5rem' }}>
          {error && <div className="error">{error}</div>}
          {success && <div className="success">{success}</div>}
        </div>
      )}

      <div className="section">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Seerr Settings</div>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">URL</label>
              <input
                type="url"
                className="form-input"
                value={seerr.url}
                onChange={(e) => setSeerr({ ...seerr, url: e.target.value })}
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
                  value={seerr.api_key}
                  onChange={(e) => setSeerr({ ...seerr, api_key: e.target.value })}
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
            <div className="card-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default SeerrConfig

