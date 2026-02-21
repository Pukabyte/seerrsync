import React, { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { MdDashboard, MdList, MdPeople, MdLogout } from 'react-icons/md'
import Login from './pages/Login'
import { logout, verifyAuth } from './api'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Users = lazy(() => import('./pages/Users'))
const Requests = lazy(() => import('./pages/Requests'))

function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path) => location.pathname === path

  const handleLogout = async () => {
    try {
      await logout()
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      localStorage.removeItem('authToken')
      navigate('/login')
    }
  }

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <img src="/assets/seerrsync.svg" alt="SeerrSync" className="navbar-logo" />
        <span>SeerrSync</span>
      </div>
      <div className="navbar-links">
        <Link to="/" className={`navbar-link ${isActive('/') ? 'active' : ''}`}>
          Dashboard
        </Link>
        <Link to="/users" className={`navbar-link ${isActive('/users') ? 'active' : ''}`}>
          Users
        </Link>
        <Link to="/requests" className={`navbar-link ${isActive('/requests') ? 'active' : ''}`}>
          Requests
        </Link>
        <button
          onClick={handleLogout}
          className="navbar-link"
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <MdLogout />
          Logout
        </button>
      </div>
    </nav>
  )
}

function ProtectedRoute({ children }) {
  const hasToken = Boolean(localStorage.getItem('authToken'))
  const [isAuthenticated, setIsAuthenticated] = useState(hasToken ? 'pending' : null)
  const navigate = useNavigate()

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('authToken')
      if (!token) {
        navigate('/login')
        return
      }

      try {
        await verifyAuth()
        setIsAuthenticated(true)
      } catch (err) {
        localStorage.removeItem('authToken')
        navigate('/login')
      }
    }

    checkAuth()
  }, [navigate])

  // No token at all — redirect handled by useEffect, show nothing
  if (isAuthenticated === null) {
    return null
  }

  // Token exists — render children optimistically while verifying
  // If verification fails, useEffect will redirect to login
  return children
}

function DockMenu() {
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname === ''
    }
    return location.pathname === path
  }

  const handleLogout = async () => {
    try {
      await logout()
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      localStorage.removeItem('authToken')
      navigate('/login')
    }
  }

  const menuItems = [
    { path: '/', label: 'Dashboard', icon: MdDashboard },
    { path: '/users', label: 'Users', icon: MdPeople },
    { path: '/requests', label: 'Requests', icon: MdList }
  ]

  return (
    <nav className="dock-menu">
      {menuItems.map((item) => {
        const IconComponent = item.icon
        return (
          <Link
            key={item.path}
            to={item.path}
            className={`dock-item ${isActive(item.path) ? 'active' : ''}`}
          >
            <span className="dock-icon">
              <IconComponent />
            </span>
            <span className="dock-label">{item.label}</span>
          </Link>
        )
      })}
      <button
        onClick={handleLogout}
        className="dock-item"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit', width: '100%' }}
      >
        <span className="dock-icon">
          <MdLogout />
        </span>
        <span className="dock-label">Logout</span>
      </button>
    </nav>
  )
}

function App() {
  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <Suspense fallback={null}>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/users" element={<Users />} />
                      <Route path="/requests" element={<Requests />} />
                    </Routes>
                  </Suspense>
                  <DockMenu />
                </>
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App

