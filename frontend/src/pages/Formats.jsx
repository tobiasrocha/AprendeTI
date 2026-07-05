import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { Pencil, Trash2, Plus } from 'lucide-react'

export default function Formats() {
  const [formats, setFormats] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', description: '', extensions: '', active: true })

  const fetchFormats = useCallback(() => {
    api.getFormats().then(setFormats).catch(console.error)
  }, [])

  useEffect(() => { fetchFormats() }, [fetchFormats])

  function openNew() {
    setEditing(null)
    setForm({ name: '', description: '', extensions: '', active: true })
    setError('')
    setShowModal(true)
  }

  function openEdit(f) {
    setEditing(f)
    setForm({ name: f.name, description: f.description || '', extensions: f.extensions || '', active: f.active === 1 })
    setError('')
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      if (editing) {
        await api.updateFormat(editing.id, { ...form, active: form.active ? 1 : 0 })
      } else {
        await api.createFormat(form)
      }
      setShowModal(false)
      fetchFormats()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(f) {
    if (!confirm(`Remover formato "${f.name}"?`))
      return
    try {
      await api.deleteFormat(f.id)
      fetchFormats()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Formatos</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Novo Formato
        </button>
      </div>

      {formats.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhum formato cadastrado</h3>
          <p>Cadastre os formatos de documentos suportados pelo sistema.</p>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descricao</th>
              <th>Extensoes</th>
              <th>Documentos</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {formats.map((f) => (
              <tr key={f.id}>
                <td><strong>{f.name}</strong></td>
                <td style={{ fontSize: '.8125rem', color: 'var(--text-muted)' }}>
                  {f.description || '—'}
                </td>
                <td>
                  <span className="badge badge-blue">{f.extensions || '—'}</span>
                </td>
                <td>{f.doc_count || 0}</td>
                <td>
                  <span className={`badge ${f.active ? 'badge-green' : 'badge-red'}`}>
                    {f.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td>
                  <div className="actions-cell">
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(f)}>
                      <Pencil size={14} />
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(f)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? 'Editar Formato' : 'Novo Formato'}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nome *</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nome do formato"
                  required
                />
              </div>
              <div className="form-group">
                <label>Descricao</label>
                <input
                  className="form-input"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Descricao opcional"
                />
              </div>
              <div className="form-group">
                <label>Extensoes</label>
                <input
                  className="form-input"
                  value={form.extensions}
                  onChange={(e) => setForm({ ...form, extensions: e.target.value })}
                  placeholder="md, markdown"
                />
                <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Separe por virgula (ex: md, markdown)
                </p>
              </div>
              {editing && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    />
                    Formato ativo
                  </label>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {editing ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
