import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Documents from './pages/Documents'
import DocumentEditor from './pages/DocumentEditor'
import DocumentViewer from './pages/DocumentViewer'
import Users from './pages/Users'
import Categories from './pages/Categories'
import Formats from './pages/Formats'
import Groups from './pages/Groups'
import Profile from './pages/Profile'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-loader">Carregando...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AdminOnly({ children }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="documents" element={<Documents />} />
        <Route path="documents/new" element={<DocumentEditor />} />
        <Route path="documents/:id/edit" element={<DocumentEditor />} />
        <Route path="documents/:id" element={<DocumentViewer />} />
        <Route path="profile" element={<Profile />} />
        <Route
          path="users"
          element={
            <AdminOnly>
              <Users />
            </AdminOnly>
          }
        />
        <Route
          path="categories"
          element={
            <AdminOnly>
              <Categories />
            </AdminOnly>
          }
        />
        <Route
          path="formats"
          element={
            <AdminOnly>
              <Formats />
            </AdminOnly>
          }
        />
        <Route
          path="groups"
          element={
            <AdminOnly>
              <Groups />
            </AdminOnly>
          }
        />
      </Route>
    </Routes>
  )
}
