import React, { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { FilePlus, Search, Pencil, Trash2, Eye, Download, FileText, ChevronRight, FolderOpen, Upload, ChevronDown, MoreVertical } from 'lucide-react'
import BatchUpload from './BatchUpload'

export default function Documents() {
  const [allDocs, setAllDocs] = useState([])
  const [categories, setCategories] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [formatFilter, setFormatFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showBatch, setShowBatch] = useState(false)
  const [expandedParents, setExpandedParents] = useState({})
  const [openMenuId, setOpenMenuId] = useState(null)
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()

  const fetchDocs = useCallback(() => {
    const params = { limit: 500 }
    if (search) params.search = search
    if (formatFilter) params.format = formatFilter
    if (categoryFilter) params.category_id = categoryFilter
    api.getDocuments(params).then((d) => {
      setAllDocs(d.documents)
      setTotal(d.total)
    })
  }, [search, formatFilter, categoryFilter])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {})
  }, [])

  async function handleDelete(id) {
    if (!confirm('Remover este documento?')) return
    await api.deleteDocument(id)
    fetchDocs()
  }

  async function handleDownload(id, title) {
    try {
      await api.downloadDocument(id, title)
    } catch (e) {
      alert('Erro ao baixar: ' + e.message)
    }
  }

  function buildTree(docs) {
    const childrenMap = {}
    docs.forEach((doc) => {
      if (doc.parent_id) {
        if (!childrenMap[doc.parent_id]) childrenMap[doc.parent_id] = []
        childrenMap[doc.parent_id].push(doc)
      }
    })
    const roots = docs.filter((doc) => !doc.parent_id)
    roots.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
    Object.values(childrenMap).forEach((children) =>
      children.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
    )
    return { roots, childrenMap }
  }

  const { roots, childrenMap } = buildTree(allDocs)

  function toggleExpand(parentId) {
    setExpandedParents((prev) => ({ ...prev, [parentId]: !prev[parentId] }))
  }

  function renderDocRow(doc, isChild = false) {
    const children = childrenMap[doc.id] || []
    const isParent = children.length > 0
    const isExpanded = expandedParents[doc.id] || false
    return (
      <React.Fragment key={doc.id}>
        <tr style={isParent ? { background: 'var(--primary-light)', borderLeft: '3px solid var(--primary)', cursor: 'pointer' } : {}} onClick={isParent ? () => toggleExpand(doc.id) : undefined}>
          <td>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, paddingLeft: isChild ? 28 : 0 }}>
              {isChild && <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
              {isParent && (
                <span style={{ display: 'flex', alignItems: 'center', color: 'var(--primary)' }}>
                  {isExpanded ? <ChevronDown size={16} /> : <FolderOpen size={16} />}
                </span>
              )}
              {!isParent && isChild && null}
              {!isParent && !isChild && null}
              <span
                style={{ cursor: 'pointer', color: 'var(--primary)', textDecoration: 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={doc.title}
                onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                onClick={(e) => { e.stopPropagation(); navigate(`/documents/${doc.id}`) }}
              >
                {doc.title}
              </span>
              {isParent && (
                <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  ({children.length})
                </span>
              )}
              {currentUser && doc.user_id !== currentUser.id && (
                <span className="badge badge-purple" style={{ fontSize: '.65rem', marginLeft: 4 }}>
                  Compartilhado
                </span>
              )}
            </div>
            {!isChild && doc.description && (
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', paddingLeft: isChild ? 28 : 0 }}>
                {doc.description.slice(0, 120)}
              </div>
            )}
            {isChild && (
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', paddingLeft: 28 }}>
                {doc.description?.slice(0, 80)}
              </div>
            )}
          </td>
          <td>
            {doc.category_name ? (
              <span
                className="badge"
                style={{ background: doc.category_color + '20', color: doc.category_color, border: '1px solid ' + doc.category_color + '40' }}
              >
                {doc.category_name}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>—</span>
            )}
          </td>
          <td>
            <span className={`badge badge-${doc.format === 'md' ? 'blue' : doc.format === 'pdf' ? 'red' : doc.format === 'docx' ? 'purple' : doc.format === 'html' ? 'green' : doc.format === 'image' ? 'orange' : 'yellow'}`}>
              {doc.format.toUpperCase()}
            </span>
          </td>
          <td>{doc.author}</td>
          <td style={{ fontSize: '.8125rem', color: 'var(--text-muted)' }}>
            {new Date(doc.updated_at).toLocaleDateString('pt-BR')}
          </td>
          <td style={{ position: 'relative' }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === doc.id ? null : doc.id) }}
              style={{ minWidth: 32, justifyContent: 'center' }}
            >
              <MoreVertical size={14} />
            </button>
            {openMenuId === doc.id && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpenMenuId(null)} />
                <div style={{
                  position: 'absolute', right: 0, top: '100%',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 50,
                  minWidth: 140, padding: 4, whiteSpace: 'nowrap',
                }}>
                  <button className="sidebar-link" style={{ border: 'none', background: 'none', width: '100%', fontSize: '.8125rem' }} onClick={() => { navigate(`/documents/${doc.id}`); setOpenMenuId(null) }}>
                    <Eye size={14} /> Visualizar
                  </button>
                  <button className="sidebar-link" style={{ border: 'none', background: 'none', width: '100%', fontSize: '.8125rem' }} onClick={() => { handleDownload(doc.id, `${doc.title}.${doc.format}`); setOpenMenuId(null) }}>
                    <Download size={14} /> Download
                  </button>
                  <button className="sidebar-link" style={{ border: 'none', background: 'none', width: '100%', fontSize: '.8125rem' }} onClick={() => { navigate(`/documents/${doc.id}/edit`); setOpenMenuId(null) }}>
                    <Pencil size={14} /> Editar
                  </button>
                  <button className="sidebar-link" style={{ border: 'none', background: 'none', width: '100%', fontSize: '.8125rem', color: 'var(--danger)' }} onClick={() => { handleDelete(doc.id); setOpenMenuId(null) }}>
                    <Trash2 size={14} /> Remover
                  </button>
                </div>
              </>
            )}
          </td>
        </tr>
        {isExpanded && children.map((child) => renderDocRow(child, true))}
      </React.Fragment>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1>Documentos</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setShowBatch(true)}>
            <Upload size={16} /> Lote
          </button>
          <Link to="/documents/new" className="btn btn-primary">
            <FilePlus size={16} /> Novo
          </Link>
        </div>
      </div>

      <div className="search-bar">
        <div className="form-group" style={{ flex: 1 }}>
          <input
            className="form-input"
            placeholder="Buscar documentos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 400 }}
          />
        </div>
        <div className="form-group">
          <select
            className="form-select"
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
          >
            <option value="">Todos formatos</option>
            <option value="image">Imagem</option>
            <option value="md">Markdown</option>
            <option value="html">HTML</option>
            <option value="pdf">PDF</option>
            <option value="docx">DOCX</option>
            <option value="txt">TXT</option>
          </select>
        </div>
        <div className="form-group">
          <select
            className="form-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Todas categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {roots.length === 0 ? (
        <div className="empty-state">
          <Search size={64} />
          <h3>Nenhum documento encontrado</h3>
          <p>{search ? 'Tente outros termos de busca.' : 'Comece criando seu primeiro documento.'}</p>
        </div>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '35%' }}>Titulo</th>
                <th style={{ width: '12%' }}>Categoria</th>
                <th style={{ width: '8%' }}>Formato</th>
                <th style={{ width: '12%' }}>Autor</th>
                <th style={{ width: '12%' }}>Atualizado</th>
                <th style={{ width: '6%' }}>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {roots.map((doc) => renderDocRow(doc))}
            </tbody>
          </table>

          <div style={{ padding: '8px 16px', fontSize: '.8125rem', color: 'var(--text-muted)' }}>
            {roots.length} documento(s) raiz &middot; {total} total
          </div>
        </>
      )}

      {showBatch && (
        <BatchUpload
          onClose={() => setShowBatch(false)}
          onSuccess={(result) => {
            setShowBatch(false)
            alert(`${result.documents.length} documento(s) criado(s) com sucesso!`)
            fetchDocs()
          }}
        />
      )}
    </div>
  )
}
