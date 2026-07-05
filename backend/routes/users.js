import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { getDb } from '../database.js'
import { authMiddleware, adminMiddleware } from '../middleware/auth.js'

const router = Router()

router.use(authMiddleware)

router.get('/', adminMiddleware, (_req, res) => {
  const users = getDb()
    .prepare('SELECT id, username, email, role, active, created_at, updated_at FROM users ORDER BY id')
    .all()

  const withGroups = users.map((u) => {
    const groups = getDb()
      .prepare('SELECT g.id, g.name FROM user_groups ug JOIN groups g ON ug.group_id = g.id WHERE ug.user_id = ?')
      .all(u.id)
    return { ...u, groups }
  })

  res.json(withGroups)
})

router.get('/:id', adminMiddleware, (req, res) => {
  const user = getDb()
    .prepare('SELECT id, username, email, role, active, created_at, updated_at FROM users WHERE id = ?')
    .get(req.params.id)

  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })

  const groups = getDb()
    .prepare('SELECT g.id, g.name FROM user_groups ug JOIN groups g ON ug.group_id = g.id WHERE ug.user_id = ?')
    .all(user.id)

  res.json({ ...user, groups })
})

router.post('/', adminMiddleware, (req, res) => {
  const { username, email, password, role, groupIds } = req.body

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email e senha obrigatórios' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' })
  }

  const existing = getDb()
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .get(username, email)

  if (existing) {
    return res.status(409).json({ error: 'Username ou email já cadastrado' })
  }

  const hash = bcrypt.hashSync(password, 12)
  const result = getDb()
    .prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)')
    .run(username, email, hash, role || 'user')

  if (groupIds && Array.isArray(groupIds)) {
    const insertGrp = getDb().prepare('INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)')
    for (const gid of groupIds) insertGrp.run(result.lastInsertRowid, gid)
  }

  const user = getDb()
    .prepare('SELECT id, username, email, role, active, created_at FROM users WHERE id = ?')
    .get(result.lastInsertRowid)

  const groups = getDb()
    .prepare('SELECT g.id, g.name FROM user_groups ug JOIN groups g ON ug.group_id = g.id WHERE ug.user_id = ?')
    .all(user.id)

  res.status(201).json({ ...user, groups })
})

router.put('/:id', adminMiddleware, (req, res) => {
  const { username, email, password, role, active, groupIds } = req.body

  const user = getDb()
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(req.params.id)

  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })

  const newUsername = username || user.username
  const newEmail = email || user.email
  const newRole = role || user.role
  const newActive = active !== undefined ? active : user.active

  const dup = getDb()
    .prepare('SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?')
    .get(newUsername, newEmail, user.id)

  if (dup) return res.status(409).json({ error: 'Username ou email já em uso' })

  if (password && password.length >= 6) {
    const hash = bcrypt.hashSync(password, 12)
    getDb()
      .prepare('UPDATE users SET username=?, email=?, password=?, role=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(newUsername, newEmail, hash, newRole, newActive ? 1 : 0, user.id)
  } else {
    getDb()
      .prepare('UPDATE users SET username=?, email=?, role=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(newUsername, newEmail, newRole, newActive ? 1 : 0, user.id)
  }

  if (groupIds !== undefined) {
    getDb().prepare('DELETE FROM user_groups WHERE user_id = ?').run(user.id)
    if (Array.isArray(groupIds)) {
      const insertGrp = getDb().prepare('INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)')
      for (const gid of groupIds) insertGrp.run(user.id, gid)
    }
  }

  const updated = getDb()
    .prepare('SELECT id, username, email, role, active, created_at, updated_at FROM users WHERE id = ?')
    .get(user.id)

  const groups = getDb()
    .prepare('SELECT g.id, g.name FROM user_groups ug JOIN groups g ON ug.group_id = g.id WHERE ug.user_id = ?')
    .all(user.id)

  res.json({ ...updated, groups })
})

router.delete('/:id', adminMiddleware, (req, res) => {
  const user = getDb()
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(req.params.id)

  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })

  if (user.role === 'admin') {
    const adminCount = getDb()
      .prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND active = 1')
      .get('admin')

    if (adminCount.count <= 1) {
      return res.status(400).json({ error: 'Não é possível remover o último administrador' })
    }
  }

  getDb().prepare('DELETE FROM users WHERE id = ?').run(user.id)
  res.json({ message: 'Usuário removido' })
})

export default router
