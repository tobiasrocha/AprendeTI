import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SessionTimeout from './SessionTimeout'
import {
  LayoutDashboard, FileText, Users, UserCog, LogOut, BookOpen, FolderTree, FileCode, Group,
  ChevronLeft, ChevronRight, Minimize, Menu,
} from 'lucide-react'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement
      setIsFullscreen(fs)
      setCollapsed(fs)
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  function exitFullscreen() {
    document.exitFullscreen?.()
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="app-layout">
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        <NavLink to="/" className="sidebar-brand" title="Dashboard">
          <BookOpen size={28} />
          <span className="sidebar-brand-text">AprendeTI</span>
        </NavLink>

        <div className="sidebar-section"><span>Principal</span></div>
        <NavLink to="/" end className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} title="Dashboard">
          <LayoutDashboard size={18} /> <span>Dashboard</span>
        </NavLink>
        <NavLink to="/documents" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} title="Documentos">
          <FileText size={18} /> <span>Documentos</span>
        </NavLink>

        {user?.role === 'admin' && (
          <>
            <div className="sidebar-section"><span>Administracao</span></div>
            <NavLink to="/users" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} title="Usuários">
              <Users size={18} /> <span>Usuários</span>
            </NavLink>
            <NavLink to="/categories" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} title="Categorias">
              <FolderTree size={18} /> <span>Categorias</span>
            </NavLink>
            <NavLink to="/formats" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} title="Formatos">
              <FileCode size={18} /> <span>Formatos</span>
            </NavLink>
            <NavLink to="/groups" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} title="Grupos">
              <Group size={18} /> <span>Grupos</span>
            </NavLink>
          </>
        )}

        <div className="sidebar-section"><span>Conta</span></div>
        <NavLink to="/profile" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} title="Meu Perfil">
          <UserCog size={18} /> <span>Meu Perfil</span>
        </NavLink>
        <button onClick={handleLogout} className="sidebar-link" style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%' }} title="Sair">
          <LogOut size={18} /> <span>Sair</span>
        </button>

        <div className="sidebar-version">
          {user?.username} &middot; v1.0
        </div>
      </aside>

      <div className={`sidebar-overlay${mobileOpen ? ' active' : ''}`} onClick={() => setMobileOpen(false)} />

      <main className={`main-content${collapsed ? ' expanded' : ''}`}>
        <div className="mobile-header">
          <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <span className="mobile-brand">AprendeTI</span>
        </div>
        <Outlet />
      </main>

      {isFullscreen && (
        <button className="fullscreen-exit" onClick={exitFullscreen} title="Sair da tela cheia">
          <Minimize size={20} />
        </button>
      )}

      <SessionTimeout />
    </div>
  )
}
