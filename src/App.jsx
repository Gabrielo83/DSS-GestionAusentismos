import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard.jsx'
import Login from './pages/Login.jsx'
import RegisterAbsence from './pages/RegisterAbsence.jsx'
import MedicalCertificate from './pages/MedicalCertificate.jsx'
import MedicalValidation from './pages/MedicalValidation.jsx'
import MedicalRecords from './pages/MedicalRecords.jsx'
import AuthContext from './context/AuthContext.jsx'
import { MOCK_USERS } from './data/mockUsers.js'
import { startQueueSync } from './utils/operationQueue.js'

const ROLE_PERMISSIONS = {
  superAdmin: ['dashboard', 'registro', 'certificados', 'validacion', 'legajos'],
  medico: ['dashboard', 'registro', 'certificados', 'validacion', 'legajos'],
  administrativo: ['dashboard', 'registro', 'certificados', 'legajos'],
  gerente: ['dashboard', 'legajos'],
  respRRHH: ['dashboard', 'legajos'],
}

const ROUTE_ACCESS = {
  dashboard: ['superAdmin', 'medico', 'administrativo', 'gerente', 'respRRHH'],
  registro: ['superAdmin', 'medico', 'administrativo'],
  certificados: ['superAdmin', 'medico', 'administrativo'],
  validacion: ['superAdmin', 'medico'],
  legajos: ['superAdmin', 'medico', 'administrativo', 'gerente', 'respRRHH'],
}

function App() {
  const initialUser =
    typeof window !== 'undefined'
      ? (() => {
          const email = window.localStorage.getItem('sessionEmail')
          if (!email) return null
          return MOCK_USERS.find((user) => user.email === email) ?? null
        })()
      : null

  const [isDark, setIsDark] = useState(false)
  const [currentUser, setCurrentUser] = useState(initialUser)
  const [userRole, setUserRole] = useState(initialUser?.role ?? null)
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(initialUser))

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
      window.localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      window.localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedTheme = window.localStorage.getItem('theme')
    if (storedTheme) {
      setIsDark(storedTheme === 'dark')
    }
  }, [])

  const toggleTheme = () => setIsDark((value) => !value)

  const handleLoginSuccess = (user) => {
    setCurrentUser(user)
    setUserRole(user.role)
    setIsAuthenticated(true)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('sessionRole', user.role)
      window.localStorage.setItem('sessionEmail', user.email)
    }
  }

  useEffect(() => {
    const stop = startQueueSync()
    return () => {
      if (typeof stop === 'function') stop()
    }
  }, [])

  const handleLogout = () => {
    setCurrentUser(null)
    setUserRole(null)
    setIsAuthenticated(false)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('sessionRole')
      window.localStorage.removeItem('sessionEmail')
    }
  }

  const ProtectedRoute = ({ children, allowedRoles }) => {
    if (!isAuthenticated) {
      return <Navigate to="/" replace />
    }
    if (allowedRoles && !allowedRoles.includes(userRole)) {
      return <Navigate to="/dashboard" replace />
    }
    return children
  }

  const renderProtected = (Component, accessKey) => (
    <ProtectedRoute allowedRoles={ROUTE_ACCESS[accessKey]}>
      <Component isDark={isDark} onToggleTheme={toggleTheme} />
    </ProtectedRoute>
  )

  const authValue = {
    role: userRole,
    user: currentUser,
    isAuthenticated,
    allowedRoutes: userRole ? ROLE_PERMISSIONS[userRole] ?? [] : [],
    logout: handleLogout,
  }

  return (
    <AuthContext.Provider value={authValue}>
      <Routes>
        <Route
          path="/"
          element={
            <Login
              isDark={isDark}
              onToggleTheme={toggleTheme}
              onLoginSuccess={handleLoginSuccess}
              isAuthenticated={isAuthenticated}
            />
          }
        />
        <Route
          path="/dashboard"
          element={renderProtected(Dashboard, 'dashboard')}
        />
        <Route
          path="/registro-ausencia"
          element={renderProtected(RegisterAbsence, 'registro')}
        />
        <Route
          path="/certificados-medicos"
          element={renderProtected(MedicalCertificate, 'certificados')}
        />
        <Route
          path="/validacion-medica"
          element={renderProtected(MedicalValidation, 'validacion')}
        />
        <Route
          path="/legajos-medicos"
          element={renderProtected(MedicalRecords, 'legajos')}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  )
}

export default App
