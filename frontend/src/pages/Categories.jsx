import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { FolderPlus, Pencil, Trash2 } from 'lucide-react'

const PRESET_COLORS = [
  '#3b82f6', '#22c55e', '#8b5cf6', '#ef4444', '#f59e0b',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
]

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '', description: '', color: '#3b82f6',
  })

  const fetchCategories = useCallback(() => {
    api.getCategories().then(setCategories).catch(console.error)
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  function openCreate() {
    setEditing(null)
    setForm({ name: '', description: '', color: '#3b82f6' })
    setError('')
    setShowModal(true)
  }

  function openEdit(cat) {
    setEditing(cat)
    setForm({ name: cat.name, description: cat.description || '', color: cat.color })
    setError('')
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      if (editing) {
        await api.updateCategory(editing.id, form)
      } else {
        await api.createCategory(form)
      }
      setShowModal(false)
      fetchCategories()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(cat) {
    if (!confirm(`Remover categoria "${cat.name}"?`)) return
    try {
      await api.deleteCategory(cat.id)
      fetchCategories()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Categorias</h1>
        <button className="btn btn-primary" onClick={openCreate}>
          <FolderPlus size={16} /> Nova Categoria
        </button>
      </div>

      <div className="grid">
        {categories.map((cat) => (
          <div key={cat.id} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                background: cat.color,
              }} />
              <h3 style={{ fontSize: '.95rem', fontWeight: 600, margin: 0 }}>{cat.name}</h3>
            </div>
            {cat.description && (
              <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                {cat.description}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                {cat.doc_count} documento(s)
              </span>
              <div className="actions-cell">
                <button className="btn btn-outline btn-sm" onClick={() => openEdit(cat)}>
                  <Pencil size={14} />
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(cat)} disabled={cat.doc_count > 0}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? 'Editar Categoria' : 'Nova Categoria'}</h2>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nome *</label>
                <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome da categoria" required />
              </div>
              <div className="form-group">
                <label>Descricao</label>
                <input className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descricao opcional" />
              </div>
              <div className="form-group">
                <label>Cor</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm({ ...form, color })}
                      style={{
                        width: 28, height: 28, borderRadius: 6, background: color,
                        border: form.color === color ? '3px solid var(--text)' : '3px solid transparent',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  style={{ width: 40, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Salvar' : 'Criar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
