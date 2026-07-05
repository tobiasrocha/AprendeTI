import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { FileText, Users, FilePlus, TrendingUp, FileBarChart } from 'lucide-react'

export default function Dashboard() {
  const [stats, setStats] = useState({ docs: 0, users: 0, formats: {} })
  const [recent, setRecent] = useState([])

  useEffect(() => {
    api.getDocuments({ limit: 5 }).then((d) => {
      setRecent(d.documents)
      setStats((s) => ({ ...s, docs: d.total }))
    })
    api.getDocuments({ limit: 100 }).then((d) => {
      const formats = {}
      d.documents.forEach((doc) => {
        formats[doc.format] = (formats[doc.format] || 0) + 1
      })
      setStats((s) => ({ ...s, formats }))
    })
    api.getUsers().then((u) => setStats((s) => ({ ...s, users: u.length }))).catch(() => {})
  }, [])

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <Link to="/documents/new" className="btn btn-primary">
          <FilePlus size={16} /> Novo Documento
        </Link>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
            <FileText size={20} />
          </div>
          <div className="stat-value">{stats.docs}</div>
          <div className="stat-label">Documentos</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#f0fdf4', color: '#22c55e' }}>
            <Users size={20} />
          </div>
          <div className="stat-value">{stats.users}</div>
          <div className="stat-label">Usuários</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#ede9fe', color: '#8b5cf6' }}>
            <TrendingUp size={20} />
          </div>
          <div className="stat-value">{Object.keys(stats.formats).length}</div>
          <div className="stat-label">Formatos</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fefce8', color: '#eab308' }}>
            <FileBarChart size={20} />
          </div>
          <div className="stat-value">
            {Object.values(stats.formats).reduce((a, b) => a + b, 0)}
          </div>
          <div className="stat-label">Total de Arquivos</div>
        </div>
      </div>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Documentos Recentes</h2>

      {recent.length === 0 ? (
        <div className="empty-state">
          <FileText size={64} />
          <h3>Nenhum documento ainda</h3>
          <p>Crie o primeiro documento para começar a construir o repositório.</p>
          <Link to="/documents/new" className="btn btn-primary">
            <FilePlus size={16} /> Criar Documento
          </Link>
        </div>
      ) : (
        <div className="grid">
          {recent.map((doc) => (
            <Link key={doc.id} to={`/documents/${doc.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <h3 style={{ fontSize: '.95rem', fontWeight: 600, marginBottom: 6, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</h3>
                <span className={`badge badge-${doc.format === 'md' ? 'blue' : doc.format === 'pdf' ? 'red' : doc.format === 'docx' ? 'purple' : doc.format === 'html' ? 'green' : doc.format === 'image' ? 'orange' : 'yellow'}`}>
                  {doc.format.toUpperCase()}
                </span>
              </div>
              <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                {doc.description?.slice(0, 120) || 'Sem descrição'}
              </p>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                {doc.author} &middot; {new Date(doc.updated_at).toLocaleDateString('pt-BR')}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
