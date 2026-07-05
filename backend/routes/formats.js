import { Router } from 'express'
import { getDb } from '../database.js'
import { authMiddleware, adminMiddleware } from '../middleware/auth.js'

const router = Router()
router.use(authMiddleware)

router.get('/', (_req, res) => {
  const formats = getDb()
    .prepare('SELECT * FROM formats ORDER BY name')
    .all()

  const simple = formats.map((f) => {
    const exts = (f.extensions || '').split(',').map((e) => e.trim()).filter(Boolean)
    const docCount = exts.length
      ? getDb().prepare(`SELECT COUNT(*) as c FROM documents WHERE format IN (${exts.map(() => '?').join(',')})`).get(...exts).c
      : 0
    return { ...f, doc_count: docCount }
  })

  res.json(simple)
})

router.get('/:id', (req, res) => {
  const fmt = getDb()
    .prepare('SELECT * FROM formats WHERE id = ?')
    .get(req.params.id)

  if (!fmt) return res.status(404).json({ error: 'Formato não encontrado' })
  res.json(fmt)
})

router.post('/', adminMiddleware, (req, res) => {
  const { name, description, extensions } = req.body

  if (!name) return res.status(400).json({ error: 'Nome obrigatorio' })

  const existing = getDb().prepare('SELECT id FROM formats WHERE name = ?').get(name)
  if (existing) return res.status(409).json({ error: 'Formato ja existe' })

  const result = getDb()
    .prepare('INSERT INTO formats (name, description, extensions) VALUES (?, ?, ?)')
    .run(name, description || '', extensions || '')

  const fmt = getDb()
    .prepare('SELECT * FROM formats WHERE id = ?')
    .get(result.lastInsertRowid)

  res.status(201).json(fmt)
})

router.put('/:id', adminMiddleware, (req, res) => {
  const fmt = getDb().prepare('SELECT * FROM formats WHERE id = ?').get(req.params.id)
  if (!fmt) return res.status(404).json({ error: 'Formato não encontrado' })

  const { name, description, extensions, active } = req.body

  const newName = name !== undefined ? name : fmt.name
  const dup = getDb()
    .prepare('SELECT id FROM formats WHERE name = ? AND id != ?')
    .get(newName, fmt.id)

  if (dup) return res.status(409).json({ error: 'Nome de formato ja em uso' })

  getDb()
    .prepare('UPDATE formats SET name=?, description=?, extensions=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(
      newName,
      description !== undefined ? description : fmt.description,
      extensions !== undefined ? extensions : fmt.extensions,
      active !== undefined ? active : fmt.active,
      fmt.id
    )

  const updated = getDb().prepare('SELECT * FROM formats WHERE id = ?').get(fmt.id)
  res.json(updated)
})

router.delete('/:id', adminMiddleware, (req, res) => {
  const fmt = getDb().prepare('SELECT * FROM formats WHERE id = ?').get(req.params.id)
  if (!fmt) return res.status(404).json({ error: 'Formato não encontrado' })

  const exts = (fmt.extensions || '').split(',').map((e) => e.trim()).filter(Boolean)
  const docCount = exts.length
    ? getDb().prepare(`SELECT COUNT(*) as c FROM documents WHERE format IN (${exts.map(() => '?').join(',')})`).get(...exts).c
    : 0

  if (docCount > 0) {
    return res.status(400).json({
      error: `Formato possui ${docCount} documento(s) vinculado(s). Remova os vinculos primeiro.`,
      docCount,
    })
  }

  getDb().prepare('DELETE FROM formats WHERE id = ?').run(fmt.id)
  res.json({ message: 'Formato removido' })
})

export default router
