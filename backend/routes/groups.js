import { Router } from 'express'
import { getDb } from '../database.js'
import { authMiddleware, adminMiddleware } from '../middleware/auth.js'

const router = Router()
router.use(authMiddleware)

router.get('/', (_req, res) => {
  const groups = getDb()
    .prepare('SELECT g.*, (SELECT COUNT(*) FROM user_groups WHERE group_id = g.id) as user_count FROM groups g ORDER BY g.name')
    .all()
  res.json(groups)
})

router.get('/:id', (req, res) => {
  const group = getDb().prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id)
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' })

  const users = getDb()
    .prepare('SELECT u.id, u.username, u.email FROM user_groups ug JOIN users u ON ug.user_id = u.id WHERE ug.group_id = ? ORDER BY u.username')
    .all(group.id)

  res.json({ ...group, users })
})

router.post('/', adminMiddleware, (req, res) => {
  const { name, description } = req.body
  if (!name) return res.status(400).json({ error: 'Nome obrigatorio' })

  const existing = getDb().prepare('SELECT id FROM groups WHERE name = ?').get(name)
  if (existing) return res.status(409).json({ error: 'Grupo ja existe' })

  const result = getDb()
    .prepare('INSERT INTO groups (name, description) VALUES (?, ?)')
    .run(name, description || '')

  const group = getDb().prepare('SELECT * FROM groups WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json(group)
})

router.put('/:id', adminMiddleware, (req, res) => {
  const group = getDb().prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id)
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' })

  const { name, description, active } = req.body

  const newName = name !== undefined ? name : group.name
  const dup = getDb().prepare('SELECT id FROM groups WHERE name = ? AND id != ?').get(newName, group.id)
  if (dup) return res.status(409).json({ error: 'Nome de grupo ja em uso' })

  getDb()
    .prepare('UPDATE groups SET name=?, description=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(newName, description !== undefined ? description : group.description, active !== undefined ? active : group.active, group.id)

  const updated = getDb().prepare('SELECT * FROM groups WHERE id = ?').get(group.id)
  res.json(updated)
})

router.delete('/:id', adminMiddleware, (req, res) => {
  const group = getDb().prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id)
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' })

  getDb().prepare('DELETE FROM user_groups WHERE group_id = ?').run(group.id)
  getDb().prepare('DELETE FROM document_group_shares WHERE group_id = ?').run(group.id)
  getDb().prepare('DELETE FROM groups WHERE id = ?').run(group.id)
  res.json({ message: 'Grupo removido' })
})

router.post('/:id/users', adminMiddleware, (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId obrigatorio' })

  const group = getDb().prepare('SELECT id FROM groups WHERE id = ?').get(req.params.id)
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' })

  try {
    getDb().prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').run(userId, group.id)
  } catch (_) {
    return res.status(409).json({ error: 'Usuario ja esta no grupo' })
  }

  res.json({ message: 'Usuario adicionado ao grupo' })
})

router.delete('/:id/users/:userId', adminMiddleware, (req, res) => {
  getDb()
    .prepare('DELETE FROM user_groups WHERE group_id = ? AND user_id = ?')
    .run(req.params.id, req.params.userId)

  res.json({ message: 'Usuario removido do grupo' })
})

export default router
