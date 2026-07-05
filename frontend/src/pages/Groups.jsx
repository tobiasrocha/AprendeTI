import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { Pencil, Trash2, Plus, Users as UsersIcon } from 'lucide-react'

export default function Groups() {
  const [groups, setGroups] = useState([])
  const [users, setUsers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [showUsersModal, setShowUsersModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', description: '', active: true })

  const fetchGroups = useCallback(() => {
    api.getGroups().then(setGroups).catch(console.error)
  }, [])

  useEffect(() => { fetchGroups(); api.getUsers().then(setUsers).catch(() => {}) }, [fetchGroups])

  function openNew() {
    setEditing(null)
    setForm({ name: '', description: '', active: true })
    setError('')
    setShowModal(true)
  }

  function openEdit(g) {
    setEditing(g)
    setForm({ name: g.name, description: g.description || '', active: g.active === 1 })
    setError('')
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      if (editing) {
        await api.updateGroup(editing.id, { ...form, active: form.active ? 1 : 0 })
      } else {
        await api.createGroup(form)
      }
      setShowModal(false)
      fetchGroups()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(g) {
    if (!confirm(`Remover grupo "${g.name}"?`)) return
    try {
      await api.deleteGroup(g.id)
      fetchGroups()
    } catch (err) {
      alert(err.message)
    }
  }

  async function openUsersModal(g) {
    const group = await api.getGroup(g.id)
    setUsers(group.users || [])
    setSelectedGroup(g)
    setShowUsersModal(true)
    setError('')
  }

  async function handleAddUser(userId) {
    try {
      await api.addUserToGroup(selectedGroup.id, userId)
      const group = await api.getGroup(selectedGroup.id)
      setUsers(group.users || [])
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemoveUser(userId) {
    await api.removeUserFromGroup(selectedGroup.id, userId)
    const group = await api.getGroup(selectedGroup.id)
    setUsers(group.users || [])
  }

  const allUsers = users

  return (
    <div>
      <div className="page-header">
        <h1>Grupos</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Novo Grupo
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhum grupo cadastrado</h3>
          <p>Crie grupos para organizar usuários e compartilhar documentos.</p>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descricao</th>
              <th>Usuários</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td><strong>{g.name}</strong></td>
                <td style={{ fontSize: '.8125rem', color: 'var(--text-muted)' }}>
                  {g.description || '—'}
                </td>
                <td>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => openUsersModal(g)}
                    style={{ gap: 4 }}
                  >
                    <UsersIcon size={14} />
                    {g.user_count || 0}
                  </button>
                </td>
                <td>
                  <span className={`badge ${g.active ? 'badge-green' : 'badge-red'}`}>
                    {g.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td>
                  <div className="actions-cell">
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(g)}>
                      <Pencil size={14} />
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(g)}>
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
            <h2>{editing ? 'Editar Grupo' : 'Novo Grupo'}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nome *</label>
                <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do grupo" required />
              </div>
              <div className="form-group">
                <label>Descricao</label>
                <input className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descricao opcional" />
              </div>
              {editing && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                    Grupo ativo
                  </label>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Salvar' : 'Criar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUsersModal && selectedGroup && (
        <div className="modal-overlay" onClick={() => setShowUsersModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h2>Usuários — {selectedGroup.name}</h2>
            {error && <div className="alert alert-error">{error}</div>}

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <select
                className="form-select"
                style={{ flex: 1 }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) { handleAddUser(e.target.value); e.target.value = '' }
                }}
              >
                <option value="">Adicionar usuário...</option>
                {allUsers.filter((u) => !users.some((ug) => ug.id === u.id)).map((u) => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
            </div>

            {users.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                {users.map((u) => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--primary-light)', borderRadius: 6, fontSize: '.8125rem' }}>
                    <span><strong>{u.username}</strong><span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{u.email}</span></span>
                    <button onClick={() => handleRemoveUser(u.id)} className="btn btn-danger btn-sm">Remover</button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>Nenhum usuário no grupo</p>
            )}

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowUsersModal(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
