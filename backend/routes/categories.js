import { Router } from 'express'
import { getDb } from '../database.js'
import { authMiddleware, adminMiddleware } from '../middleware/auth.js'

const router = Router()
router.use(authMiddleware)

router.get('/', (_req, res) => {
  const categories = getDb()
    .prepare('SELECT c.*, (SELECT COUNT(*) FROM documents WHERE category_id = c.id) as doc_count FROM categories c ORDER BY c.name')
    .all()
  res.json(categories)
})

router.get('/:id', (req, res) => {
  const cat = getDb()
    .prepare('SELECT c.*, (SELECT COUNT(*) FROM documents WHERE category_id = c.id) as doc_count FROM categories c WHERE c.id = ?')
    .get(req.params.id)

  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' })
  res.json(cat)
})

router.post('/', adminMiddleware, (req, res) => {
  const { name, description, color } = req.body

  if (!name) return res.status(400).json({ error: 'Nome obrigatorio' })

  const existing = getDb().prepare('SELECT id FROM categories WHERE name = ?').get(name)
  if (existing) return res.status(409).json({ error: 'Categoria ja existe' })

  const result = getDb()
    .prepare('INSERT INTO categories (name, description, color) VALUES (?, ?, ?)')
    .run(name, description || '', color || '#3b82f6')

  const cat = getDb()
    .prepare('SELECT * FROM categories WHERE id = ?')
    .get(result.lastInsertRowid)

  res.status(201).json(cat)
})

router.put('/:id', adminMiddleware, (req, res) => {
  const cat = getDb().prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id)
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' })

  const { name, description, color } = req.body

  const newName = name || cat.name
  const dup = getDb()
    .prepare('SELECT id FROM categories WHERE name = ? AND id != ?')
    .get(newName, cat.id)

  if (dup) return res.status(409).json({ error: 'Nome de categoria ja em uso' })

  getDb()
    .prepare('UPDATE categories SET name=?, description=?, color=? WHERE id=?')
    .run(newName, description !== undefined ? description : cat.description, color || cat.color, cat.id)

  const updated = getDb().prepare('SELECT * FROM categories WHERE id = ?').get(cat.id)
  res.json(updated)
})

router.delete('/:id', adminMiddleware, (req, res) => {
  const cat = getDb().prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id)
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' })

  const docCount = getDb()
    .prepare('SELECT COUNT(*) as c FROM documents WHERE category_id = ?')
    .get(cat.id).c

  if (docCount > 0) {
    return res.status(400).json({
      error: `Categoria possui ${docCount} documento(s) vinculado(s). Remova os vinculos primeiro.`,
      docCount,
    })
  }

  getDb().prepare('DELETE FROM categories WHERE id = ?').run(cat.id)
  res.json({ message: 'Categoria removida' })
})

export default router
