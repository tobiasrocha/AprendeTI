import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { UserPlus, Pencil, Trash2 } from 'lucide-react'

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    username: '', email: '', password: '', role: 'user', active: true,
    groupIds: [],
  })

  const fetchUsers = useCallback(() => {
    api.getUsers().then(setUsers).catch(console.error)
  }, [])

  useEffect(() => {
    fetchUsers()
    api.getGroups().then((g) => setGroups(g.filter((x) => x.active))).catch(() => {})
  }, [fetchUsers])

  function openCreate() {
    setEditing(null)
    setForm({ username: '', email: '', password: '', role: 'user', active: true, groupIds: [] })
    setError('')
    setShowModal(true)
  }

  function openEdit(user) {
    setEditing(user)
    setForm({
      username: user.username,
      email: user.email,
      password: '',
      role: user.role,
      active: user.active === 1,
      groupIds: (user.groups || []).map((g) => g.id),
    })
    setError('')
    setShowModal(true)
  }

  function toggleGroup(groupId) {
    setForm((prev) => ({
      ...prev,
      groupIds: prev.groupIds.includes(groupId)
        ? prev.groupIds.filter((id) => id !== groupId)
        : [...prev.groupIds, groupId],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      if (editing) {
        const data = { ...form, active: form.active ? 1 : 0 }
        if (!form.password) delete data.password
        await api.updateUser(editing.id, data)
      } else {
        await api.createUser(form)
      }
      setShowModal(false)
      fetchUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(user) {
    if (!confirm(`Remover usuário "${user.username}"?`)) return
    try {
      await api.deleteUser(user.id)
      fetchUsers()
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Usuários</h1>
        <button className="btn btn-primary" onClick={openCreate}>
          <UserPlus size={16} /> Novo Usuário
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Email</th>
            <th>Função</th>
            <th>Grupos</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.username}</strong></td>
              <td>{u.email}</td>
              <td>
                <span className={`badge ${u.role === 'admin' ? 'badge-purple' : 'badge-blue'}`}>
                  {u.role}
                </span>
              </td>
              <td style={{ fontSize: '.75rem' }}>
                {(u.groups || []).length > 0
                  ? (u.groups || []).map((g) => g.name).join(', ')
                  : <span style={{ color: 'var(--text-muted)' }}>—</span>}
              </td>
              <td>
                <span className={`badge ${u.active ? 'badge-green' : 'badge-red'}`}>
                  {u.active ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td>
                <div className="actions-cell">
                  <button className="btn btn-outline btn-sm" onClick={() => openEdit(u)}>
                    <Pencil size={14} />
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? 'Editar Usuário' : 'Novo Usuário'}</h2>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Username *</label>
                <input className="form-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Senha {editing ? '(deixe vazio para manter)' : '*'}</label>
                <input className="form-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editing} minLength={6} />
              </div>
              <div className="form-group">
                <label>Função</label>
                <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="user">Usuário</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {groups.length > 0 && (
                <div className="form-group">
                  <label>Grupos</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
                    {groups.map((g) => (
                      <label
                        key={g.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: '.8125rem', cursor: 'pointer',
                          padding: '4px 10px', borderRadius: 6,
                          background: form.groupIds.includes(g.id) ? 'var(--primary-light)' : 'var(--bg)',
                          border: `1px solid ${form.groupIds.includes(g.id) ? 'var(--primary)' : 'var(--border)'}`,
                          color: form.groupIds.includes(g.id) ? 'var(--primary)' : 'var(--text)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={form.groupIds.includes(g.id)}
                          onChange={() => toggleGroup(g.id)}
                          style={{ accentColor: 'var(--primary)' }}
                        />
                        {g.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {editing && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                    Usuário ativo
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
    </div>
  )
}
