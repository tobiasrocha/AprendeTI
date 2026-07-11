import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { ArrowLeft, Pencil, Trash2, Download, FileText, GitBranch, ChevronRight, Maximize, Minimize, Share2, X, ZoomIn, ZoomOut, RotateCcw, ArrowUp, Link, Link2Off, Copy } from 'lucide-react'
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
  const [imageUrl, setImageUrl] = useState(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shares, setShares] = useState([])
  const [groupShares, setGroupShares] = useState([])
  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [shareError, setShareError] = useState('')
  const [publicLink, setPublicLink] = useState(null)
  const [publicLinkLoading, setPublicLinkLoading] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [fontSize, setFontSize] = useState(16)
  const [toolbarHidden, setToolbarHidden] = useState(false)

  const imageRef = useRef(null)
  const lightboxRef = useRef(null)
  const renderRef = useRef(null)
  const hideTimer = useRef(null)

  const showToolbar = useCallback(() => {
    setToolbarHidden(false)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      setToolbarHidden(true)
    }, 3000)
  }, [])

  useEffect(() => {
    function onScroll() {
      setToolbarHidden(true)
      clearTimeout(hideTimer.current)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('click', showToolbar)
    document.addEventListener('touchstart', showToolbar)
    showToolbar()
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', showToolbar)
      document.removeEventListener('touchstart', showToolbar)
      clearTimeout(hideTimer.current)
    }
  }, [showToolbar])

  useEffect(() => {
    api.getDocument(id).then((d) => {
      setDoc(d)
      if (d.format === 'pdf' && d.filename) {
        loadBinaryInline(id, setPdfUrl)
      } else if (d.format === 'image' && d.filename) {
        loadBinaryInline(id, setImageUrl)
      }
    })
    api.renderDocument(id).then((d) => {
      setHtml(d.html)
      setLoading(false)
    })
  }, [id])

  async function loadBinaryInline(docId, setter) {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/documents/${docId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setter(url)
    } catch (_) {}
  }

  function openLightbox(src) {
    setLightboxSrc(src || imageUrl)
    setLightboxOpen(true)
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  function closeLightbox() {
    setLightboxOpen(false)
    setLightboxSrc('')
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  function handleZoomIn() { setZoom((z) => Math.min(z + 0.25, 5)) }
  function handleZoomOut() { setZoom((z) => Math.max(z - 0.25, 0.25)) }
  function handleZoomReset() { setZoom(1); setPan({ x: 0, y: 0 }) }

  function handleWheel(e) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setZoom((z) => Math.max(0.25, Math.min(5, z + delta)))
  }

  function handleMouseDown(e) {
    if (zoom <= 1) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  function handleMouseMove(e) {
    if (!isDragging || zoom <= 1) return
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  function handleMouseUp() { setIsDragging(false) }

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && lightboxOpen) closeLightbox()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [lightboxOpen])

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [])

  function handleRenderClick(e) {
    const img = e.target.closest('img')
    if (img) {
      openLightbox(img.src)
      return
    }
    const link = e.target.closest('a')
    if (!link) return
    const href = link.getAttribute('href')
    if (!href) return
    const match = href.match(/\/api\/documents\/(\d+)\/download/)
    if (match) {
      e.preventDefault()
      const docId = match[1]
      if (doc && String(doc.id) === docId && doc.format === 'pdf' && pdfUrl) {
        window.open(pdfUrl, '_blank')
        return
      }
      if (doc && String(doc.id) === docId && doc.format === 'pdf') {
        loadBinaryInline(docId, (url) => window.open(url, '_blank'))
        return
      }
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
    setLinkCopied(false)
    api.getDocument(id).then((d) => {
      if (d.public_token) {
        setPublicLink({ token: d.public_token, url: `/api/public/d/${d.public_token}` })
      } else {
        setPublicLink(null)
      }
    }).catch(() => {})
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

  useEffect(() => {
    function onScroll() { setShowScrollTop(window.scrollY > 600) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete() {
    if (!confirm('Remover este documento?')) return
    await api.deleteDocument(id)
    navigate('/documents')
  }

  async function handleDownload() {
    try {
      await api.downloadDocument(id, `${doc.title}.${doc.format === 'image' ? 'png' : doc.format}`)
    } catch (e) {
      alert('Erro ao baixar: ' + e.message)
    }
  }

  const formatBadgeClass = doc ? `badge-${doc.format === 'md' ? 'blue' : doc.format === 'pdf' ? 'red' : doc.format === 'docx' ? 'purple' : doc.format === 'html' ? 'green' : doc.format === 'image' ? 'orange' : 'yellow'}` : ''

  if (loading) return <div className="page-loader">Carregando...</div>
  if (!doc) return <div className="page-loader">Documento não encontrado</div>

  const isImage = doc.format === 'image' && imageUrl

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
              <span className={`badge ${formatBadgeClass}`}>
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
                    <span className={`badge badge-${child.format === 'md' ? 'blue' : child.format === 'pdf' ? 'red' : child.format === 'docx' ? 'purple' : child.format === 'html' ? 'green' : child.format === 'image' ? 'orange' : 'yellow'}`}>
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

      {isImage ? (
        <div className="image-viewer-inline" onClick={() => openLightbox(imageUrl)}>
          <img src={imageUrl} alt={doc.title} />
          <div className="image-viewer-hint">Clique para ampliar</div>
        </div>
      ) : pdfUrl && doc.format === 'pdf' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="mobile-pdf-btn" style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <button className="btn btn-primary" onClick={() => window.open(pdfUrl, '_blank')} style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}>
              <FileText size={20} style={{ marginRight: 8 }} />
              Abrir PDF no Navegador
            </button>
          </div>
          <iframe
            className="desktop-pdf-iframe"
            src={pdfUrl}
            style={{ width: '100%', height: fullscreen ? '100vh' : '80vh', border: '1px solid var(--border)', borderRadius: 8 }}
            title={doc.title}
          />
        </div>
      ) : (
        <div
          className="doc-render"
          ref={renderRef}
          onClick={handleRenderClick}
          style={{ '--doc-font-size': `${fontSize / 16}rem` }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}

      {lightboxOpen && lightboxSrc && (
        <div
          className="lightbox-overlay"
          ref={lightboxRef}
          onClick={(e) => { if (e.target === lightboxRef.current) closeLightbox() }}
          onWheel={handleWheel}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        >
          <button className="lightbox-close" onClick={closeLightbox}>
            <X size={24} />
          </button>

          <div className="lightbox-toolbar">
            <button className="lightbox-btn" onClick={handleZoomIn} title="Ampliar">
              <ZoomIn size={18} />
            </button>
            <button className="lightbox-btn" onClick={handleZoomOut} title="Reduzir">
              <ZoomOut size={18} />
            </button>
            <button className="lightbox-btn" onClick={handleZoomReset} title="Original">
              <RotateCcw size={18} />
            </button>
            <span className="lightbox-zoom-level">{Math.round(zoom * 100)}%</span>
          </div>

          <div style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform .15s ease-out',
          }}>
            <img
              ref={imageRef}
              src={lightboxSrc}
              alt={doc.title}
              onMouseDown={handleMouseDown}
              draggable={false}
              style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', userSelect: 'none' }}
            />
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 640px) {
          .desktop-pdf-iframe { display: none !important; }
        }
        @media (min-width: 641px) {
          .mobile-pdf-btn { display: none !important; }
        }
      `}</style>

      {/* Toolbar Flutuante */}
      <div className={`viewer-toolbar ${toolbarHidden ? 'hidden' : ''}`}>
        {!isImage && doc.format !== 'pdf' && (
          <>
            <button onClick={() => setFontSize((s) => Math.max(s - 2, 10))} title="Diminuir fonte">
              <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>A-</span>
            </button>
            <span style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-muted)', minWidth: '36px', textAlign: 'center', lineHeight: '36px' }}>
              {fontSize}px
            </span>
            <button onClick={() => setFontSize((s) => Math.min(s + 2, 32))} title="Aumentar fonte">
              <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>A+</span>
            </button>
            <button onClick={() => setFontSize(16)} title="Restaurar fonte">
              <RotateCcw size={15} />
            </button>
            <div className="sep"></div>
          </>
        )}
        <button onClick={toggleFullscreen} title="Tela cheia">
          {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      </div>

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

            <div style={{
              marginTop: 16, marginBottom: 16, padding: 16,
              borderTop: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: '.75rem', fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                <Link size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Link Público
              </div>
              {publicLink ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="form-input"
                    type="text"
                    readOnly
                    value={`${window.location.origin}${publicLink.url}`}
                    style={{ fontSize: '.75rem', fontFamily: 'monospace' }}
                    onClick={(e) => e.target.select()}
                  />
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}${publicLink.url}`)
                      setLinkCopied(true)
                      setTimeout(() => setLinkCopied(false), 2000)
                    }}
                    title="Copiar link"
                  >
                    {linkCopied ? <span style={{ color: 'var(--success)', fontSize: '.7rem' }}>Copiado!</span> : <Copy size={14} />}
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={async () => {
                      try {
                        await api.revokePublicLink(id)
                        setPublicLink(null)
                      } catch (e) {
                        setShareError(e.message)
                      }
                    }}
                    title="Remover link público"
                    style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  >
                    <Link2Off size={14} />
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    setPublicLinkLoading(true)
                    try {
                      const result = await api.generatePublicLink(id)
                      setPublicLink({ token: result.token, url: result.url })
                    } catch (e) {
                      setShareError(e.message)
                    } finally {
                      setPublicLinkLoading(false)
                    }
                  }}
                  disabled={publicLinkLoading}
                >
                  <Link size={14} /> {publicLinkLoading ? 'Gerando...' : 'Gerar link público'}
                </button>
              )}
              <p style={{ fontSize: '.6875rem', color: 'var(--text-muted)', marginTop: 6 }}>
                Qualquer pessoa com o link pode visualizar este documento sem fazer login.
              </p>
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

      {showScrollTop && (
        <button className="scroll-top-btn" onClick={scrollToTop} title="Voltar ao topo">
          <ArrowUp size={20} />
        </button>
      )}
    </div>
  )
}
