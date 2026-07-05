import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { ArrowLeft, Pencil, Trash2, Download, FileText, GitBranch, ChevronRight, Maximize, Minimize, Share2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function DocumentViewer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const [doc, setDoc] = useState(null)
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [showChildren, setShowChildren] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shares, setShares] = useState([])
  const [groupShares, setGroupShares] = useState([])
  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [shareError, setShareError] = useState('')
  const renderRef = useRef(null)

  useEffect(() => {
    api.getDocument(id).then((d) => {
      setDoc(d)
      if (d.format === 'pdf' && d.filename) {
        loadPdfInline(id)
      }
    })
    api.renderDocument(id).then((d) => {
      setHtml(d.html)
      setLoading(false)
      if (d.format === 'pdf') {
        loadPdfInline(id)
      }
    })
  }, [id])

  async function loadPdfInline(docId) {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/documents/${docId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
    } catch (_) {}
  }

  function handleRenderClick(e) {
    const link = e.target.closest('a')
    if (!link) return
    const href = link.getAttribute('href')
    if (!href) return
    const match = href.match(/\/api\/documents\/(\d+)\/download/)
    if (match) {
      e.preventDefault()
      const docId = match[1]
      const title = (doc && doc.id === Number(docId)) ? doc.title : 'documento'
      handleDownload(docId, title)
    }
  }

  function openShareModal() {
    api.getDocumentShares(id).then((d) => { setShares(d.users || []); setGroupShares(d.groups || []) }).catch(() => {})
    api.getUsers().then(setUsers).catch(() => {})
    api.getGroups().then(setGroups).catch(() => {})
    setShowShareModal(true)
    setShareError('')
  }

  async function handleShare() {
    if (!selectedUserId) return
    try {
      await api.shareDocument(id, selectedUserId)
      const updated = await api.getDocumentShares(id)
      setShares(updated.users || [])
      setSelectedUserId('')
      setShareError('')
    } catch (e) {
      setShareError(e.message)
    }
  }

  async function handleShareGroup() {
    if (!selectedGroupId) return
    try {
      await api.shareDocumentWithGroup(id, selectedGroupId)
      const updated = await api.getDocumentShares(id)
      setGroupShares(updated.groups || [])
      setSelectedGroupId('')
      setShareError('')
    } catch (e) {
      setShareError(e.message)
    }
  }

  async function handleUnshare(userId) {
    await api.unshareDocument(id, userId)
    const updated = await api.getDocumentShares(id)
    setShares(updated.users || [])
  }

  async function handleUnshareGroup(groupId) {
    await api.unshareDocumentFromGroup(id, groupId)
    const updated = await api.getDocumentShares(id)
    setGroupShares(updated.groups || [])
  }

  const toggleFullscreen = useCallback(() => {
    if (!fullscreen) {
      document.documentElement.requestFullscreen?.()
      setFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setFullscreen(false)
    }
  }, [fullscreen])

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  async function handleDelete() {
    if (!confirm('Remover este documento?')) return
    await api.deleteDocument(id)
    navigate('/documents')
  }

  async function handleDownload() {
    try {
      await api.downloadDocument(id, `${doc.title}.${doc.format}`)
    } catch (e) {
      alert('Erro ao baixar: ' + e.message)
    }
  }

  if (loading) return <div className="page-loader">Carregando...</div>
  if (!doc) return <div className="page-loader">Documento não encontrado</div>

  return (
    <div>
      <div className="page-header" style={fullscreen ? { marginBottom: 20 } : undefined}>
        <div>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/documents')} style={fullscreen ? { marginBottom: 0 } : { marginBottom: 12 }}>
            <ArrowLeft size={14} /> Documentos
          </button>
          {!fullscreen && <h1>{doc.title}</h1>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {fullscreen ? null : (
            <>
              {currentUser && doc.user_id === currentUser.id && (
                <button className="btn btn-outline btn-sm" onClick={openShareModal} title="Compartilhar">
                  <Share2 size={14} /> Compartilhar
                </button>
              )}
              {currentUser && doc.user_id === currentUser.id && (
                <button className="btn btn-outline btn-sm" onClick={() => navigate(`/documents/${id}/edit`)}>
                  <Pencil size={14} /> Editar
                </button>
              )}
              <button className="btn btn-outline btn-sm" onClick={toggleFullscreen} title="Tela cheia">
                <Maximize size={14} />
              </button>
              {currentUser && doc.user_id === currentUser.id && (
                <button className="btn btn-danger btn-sm" onClick={handleDelete}>
                  <Trash2 size={14} /> Remover
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {!fullscreen && (
        <>
          <div className="doc-meta">
            <span>
              <span className={`badge badge-${doc.format === 'md' ? 'blue' : doc.format === 'pdf' ? 'red' : doc.format === 'docx' ? 'purple' : doc.format === 'html' ? 'green' : 'yellow'}`}>
                {doc.format.toUpperCase()}
              </span>
            </span>
            {doc.category_name && (
              <span>
                <span className="badge" style={{ background: (doc.category_color || '#3b82f6') + '20', color: doc.category_color || '#3b82f6', border: '1px solid ' + (doc.category_color || '#3b82f6') + '40' }}>
                  {doc.category_name}
                </span>
              </span>
            )}
            <span>Autor: {doc.author}</span>
            <span>Criado: {new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
            <span>Atualizado: {new Date(doc.updated_at).toLocaleDateString('pt-BR')}</span>
            {currentUser && doc.user_id !== currentUser.id && (
              <span>
                <span className="badge badge-purple">Compartilhado com você</span>
              </span>
            )}
            {doc.children && doc.children.length > 0 && (
              <span>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowChildren(!showChildren)}
                  style={{ gap: 4 }}
                >
                  <GitBranch size={14} />
                  Subdocumentos ({doc.children.length})
                  <span style={{ fontSize: '.7rem', marginLeft: 2 }}>{showChildren ? '▲' : '▼'}</span>
                </button>
              </span>
            )}
          </div>

          {showChildren && doc.children && doc.children.length > 0 && (
            <div style={{
              marginTop: -8, marginBottom: 20, padding: '12px 16px',
              background: 'var(--primary-light)', borderRadius: 8,
              border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                {doc.children.map((child) => (
                  <a
                    key={child.id}
                    href={`/documents/${child.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 14px', background: 'var(--bg-card)',
                      border: '1px solid var(--border)', borderRadius: 6,
                      textDecoration: 'none', color: 'var(--text)',
                      fontSize: '.875rem', fontWeight: 500,
                      transition: 'border-color .15s',
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <span className={`badge badge-${child.format === 'md' ? 'blue' : child.format === 'pdf' ? 'red' : child.format === 'docx' ? 'purple' : child.format === 'html' ? 'green' : 'yellow'}`}>
                      {child.format.toUpperCase()}
                    </span>
                    <span style={{ flex: 1 }}>{child.title}</span>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{child.author}</span>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {doc.parent_title && (
            <div style={{ marginBottom: 20, padding: '12px 16px', background: 'var(--primary-light)', borderRadius: 8, fontSize: '.875rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <GitBranch size={16} style={{ color: 'var(--primary)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Subdocumento de</span>
              <a href={`/documents/${doc.parent_id}`} style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                {doc.parent_title}
              </a>
            </div>
          )}

          {doc.description && (
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: '.9375rem' }}>
              {doc.description}
            </p>
          )}
        </>
      )}

      {pdfUrl && doc.format === 'pdf' ? (
        <iframe
          src={pdfUrl}
          style={{ width: '100%', height: '80vh', border: '1px solid var(--border)', borderRadius: 8 }}
          title={doc.title}
        />
      ) : (
        <div
          className="doc-render"
          ref={renderRef}
          onClick={handleRenderClick}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}

      {showShareModal && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h2>Compartilhar Documento</h2>
            {shareError && <div className="alert alert-error">{shareError}</div>}

            <div style={{ fontSize: '.75rem', fontWeight: 600, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Usuários</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <select className="form-select" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} style={{ flex: 1 }}>
                <option value="">Selecionar usuário...</option>
                {users.filter((u) => !shares.some((s) => s.id === u.id)).map((u) => (
                  <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm" onClick={handleShare} disabled={!selectedUserId}>Compartilhar</button>
            </div>

            <div style={{ fontSize: '.75rem', fontWeight: 600, marginBottom: 4, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Grupos</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <select className="form-select" value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)} style={{ flex: 1 }}>
                <option value="">Selecionar grupo...</option>
                {groups.filter((g) => !groupShares.some((s) => s.id === g.id)).map((g) => (
                  <option key={g.id} value={g.id}>{g.name} ({g.user_count || 0} usuários)</option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm" onClick={handleShareGroup} disabled={!selectedGroupId}>Compartilhar</button>
            </div>

            {(shares.length > 0 || groupShares.length > 0) && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '.8125rem', fontWeight: 600, marginBottom: 6 }}>Compartilhado com:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {shares.map((s) => (
                    <div key={'u' + s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--primary-light)', borderRadius: 6, fontSize: '.8125rem' }}>
                      <span><strong>{s.username}</strong><span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{s.email}</span></span>
                      <button onClick={() => handleUnshare(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}><X size={14} /></button>
                    </div>
                  ))}
                  {groupShares.map((g) => (
                    <div key={'g' + g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#ede9fe', borderRadius: 6, fontSize: '.8125rem' }}>
                      <span><strong>{g.username}</strong><span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{g.user_count || 0} usuários</span></span>
                      <button onClick={() => handleUnshareGroup(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {shares.length === 0 && groupShares.length === 0 && (
              <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>Nenhum compartilhamento ativo.</p>
            )}

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowShareModal(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
