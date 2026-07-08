import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'
import { getDb } from '../database.js'
import { authMiddleware } from '../middleware/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    cb(null, UPLOAD_DIR)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.html', '.htm', '.docx', '.md', '.txt', '.jpg', '.jpeg', '.png']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Formato não suportado. Use: PDF, HTML, DOCX, MD, TXT, JPG, PNG'))
    }
  },
})

const router = Router()
router.use(authMiddleware)

const FORMAT_MAP = {
  '.pdf': 'pdf',
  '.html': 'html',
  '.htm': 'html',
  '.docx': 'docx',
  '.md': 'md',
  '.txt': 'txt',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
}

function detectFormat(filename) {
  const ext = path.extname(filename).toLowerCase()
  return FORMAT_MAP[ext] || 'txt'
}

function getMimeType(format, filename) {
  if (filename) {
    const ext = path.extname(filename).toLowerCase()
    const extMimes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    }
    if (extMimes[ext]) return extMimes[ext]
  }
  const mimes = {
    pdf: 'application/pdf',
    html: 'text/html',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    md: 'text/markdown',
    txt: 'text/plain',
    image: 'application/octet-stream',
  }
  return mimes[format] || 'application/octet-stream'
}

function sanitizeFilename(name) {
  return name.replace(/[^\w\sÀ-ÿ.-]/g, '').replace(/\s+/g, '_').substring(0, 200)
}

function contentDisposition(disposition, filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/\s+/g, '_').substring(0, 200) || 'arquivo'
  const encoded = encodeURIComponent(filename)
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

function getAccessibleDocument(docId, userId) {
  return getDb()
    .prepare(
      `SELECT * FROM documents
       WHERE id = ? AND (
         user_id = ?
         OR id IN (SELECT document_id FROM document_shares WHERE shared_with_user_id = ?)
         OR id IN (SELECT dgs.document_id FROM document_group_shares dgs JOIN user_groups ug ON dgs.group_id = ug.group_id WHERE ug.user_id = ?)
       )`
    )
    .get(docId, userId, userId, userId)
}

router.get('/', (req, res) => {
  const { search, format, category_id, parent_id, root, limit = 50, offset = 0 } = req.query

  const baseFrom = 'FROM documents d JOIN users u ON d.user_id = u.id LEFT JOIN categories c ON d.category_id = c.id LEFT JOIN documents p ON d.parent_id = p.id WHERE 1=1'
  const baseSelect = 'SELECT d.*, u.username as author, c.name as category_name, c.color as category_color, p.title as parent_title'

  const conditions = []
  const condParams = []

  conditions.push('(d.user_id = ? OR d.id IN (SELECT document_id FROM document_shares WHERE shared_with_user_id = ?) OR d.id IN (SELECT dgs.document_id FROM document_group_shares dgs JOIN user_groups ug ON dgs.group_id = ug.group_id WHERE ug.user_id = ?))')
  condParams.push(req.user.id, req.user.id, req.user.id)

  if (search) {
    conditions.push('(d.title LIKE ? OR d.description LIKE ? OR d.content LIKE ?)')
    const term = `%${search}%`
    condParams.push(term, term, term)
  }

  if (format) {
    conditions.push('d.format = ?')
    condParams.push(format)
  }

  if (category_id) {
    conditions.push('d.category_id = ?')
    condParams.push(category_id)
  }

  if (parent_id) {
    conditions.push('d.parent_id = ?')
    condParams.push(parent_id)
  }

  if (root === '1') {
    conditions.push('d.parent_id IS NULL')
  }

  const whereClause = conditions.length ? ' AND ' + conditions.join(' AND ') : ''

  const countSql = `SELECT COUNT(*) as total ${baseFrom}${whereClause}`
  const { total } = getDb().prepare(countSql).get(...condParams)

  const dataSql = `${baseSelect} ${baseFrom}${whereClause} ORDER BY d.updated_at DESC LIMIT ? OFFSET ?`
  const documents = getDb().prepare(dataSql).all(...condParams, Number(limit), Number(offset))

  res.json({ documents, total, limit: Number(limit), offset: Number(offset) })
})

router.get('/:id', (req, res) => {
  const doc = getDb()
    .prepare(`SELECT d.*, u.username as author, c.name as category_name, c.color as category_color,
              p.title as parent_title, p.id as parent_id
              FROM documents d
              JOIN users u ON d.user_id = u.id
              LEFT JOIN categories c ON d.category_id = c.id
              LEFT JOIN documents p ON d.parent_id = p.id
              WHERE d.id = ? AND (d.user_id = ? OR d.id IN (SELECT document_id FROM document_shares WHERE shared_with_user_id = ?) OR d.id IN (SELECT dgs.document_id FROM document_group_shares dgs JOIN user_groups ug ON dgs.group_id = ug.group_id WHERE ug.user_id = ?))`)
    .get(req.params.id, req.user.id, req.user.id, req.user.id)

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  const children = getDb()
    .prepare(`SELECT d.id, d.title, d.format, d.updated_at, u.username as author
              FROM documents d JOIN users u ON d.user_id = u.id
              WHERE d.parent_id = ? ORDER BY d.title`)
    .all(doc.id)

  res.json({ ...doc, children })
})

router.post('/', (req, res) => {
  const { title, description, content, format, category_id, parent_id } = req.body

  if (!title) return res.status(400).json({ error: 'Título obrigatorio' })

  const catId = category_id || null
  const parId = parent_id || null

  if (parId) {
    const parent = getDb().prepare('SELECT id FROM documents WHERE id = ?').get(parId)
    if (!parent) return res.status(400).json({ error: 'Documento pai não encontrado' })
  }

  const result = getDb()
    .prepare('INSERT INTO documents (title, description, content, format, user_id, category_id, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(title, description || '', content || '', format || 'md', req.user.id, catId, parId)

  const doc = getDb()
    .prepare(`SELECT d.*, u.username as author, c.name as category_name, c.color as category_color,
              p.title as parent_title
              FROM documents d JOIN users u ON d.user_id = u.id
              LEFT JOIN categories c ON d.category_id = c.id
              LEFT JOIN documents p ON d.parent_id = p.id
              WHERE d.id = ?`)
    .get(result.lastInsertRowid)

  res.status(201).json(doc)
})

router.put('/:id', (req, res) => {
  const doc = getDb()
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  const { title, description, content, format, category_id, parent_id } = req.body

  const catId = category_id !== undefined ? (category_id || null) : doc.category_id
  const parId = parent_id !== undefined ? (parent_id || null) : doc.parent_id

  if (parId) {
    if (Number(parId) === doc.id) {
      return res.status(400).json({ error: 'Um documento não pode ser pai de si mesmo' })
    }
    const parent = getDb().prepare('SELECT id FROM documents WHERE id = ?').get(parId)
    if (!parent) return res.status(400).json({ error: 'Documento pai não encontrado' })
  }

  getDb()
    .prepare('UPDATE documents SET title=?, description=?, content=?, format=?, category_id=?, parent_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(
      title || doc.title,
      description !== undefined ? description : doc.description,
      content !== undefined ? content : doc.content,
      format || doc.format,
      catId,
      parId,
      doc.id
    )

  const updated = getDb()
    .prepare(`SELECT d.*, u.username as author, c.name as category_name, c.color as category_color,
              p.title as parent_title
              FROM documents d JOIN users u ON d.user_id = u.id
              LEFT JOIN categories c ON d.category_id = c.id
              LEFT JOIN documents p ON d.parent_id = p.id
              WHERE d.id = ?`)
    .get(doc.id)

  const children = getDb()
    .prepare(`SELECT d.id, d.title, d.format, d.updated_at, u.username as author
              FROM documents d JOIN users u ON d.user_id = u.id
              WHERE d.parent_id = ? ORDER BY d.title`)
    .all(doc.id)

  res.json({ ...updated, children })
})

router.delete('/:id', (req, res) => {
  const doc = getDb()
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  if (doc.filename) {
    const filePath = path.join(UPLOAD_DIR, doc.filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }

  getDb().prepare('DELETE FROM documents WHERE id = ?').run(doc.id)
  res.json({ message: 'Documento removido' })
})

router.post('/:id/upload', upload.single('file'), (req, res) => {
  const doc = getDb()
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' })

  const fileFormat = detectFormat(req.file.originalname)
  const fileContent = fileFormat === 'txt' || fileFormat === 'md' || fileFormat === 'html'
    ? fs.readFileSync(req.file.path, 'utf-8')
    : ''

  if (doc.filename) {
    const oldPath = path.join(UPLOAD_DIR, doc.filename)
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
  }

  getDb()
    .prepare(`UPDATE documents SET filename=?, original_name=?, file_size=?, format=?, content=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(req.file.filename, req.file.originalname, req.file.size, fileFormat, fileContent, doc.id)

  const updated = getDb()
    .prepare('SELECT d.*, u.username as author FROM documents d JOIN users u ON d.user_id = u.id WHERE d.id = ?')
    .get(doc.id)

  res.json(updated)
})

router.post('/batch', upload.array('files', 30), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' })
  }

  const { category_id, parent_id } = req.body
  const catId = category_id || null
  const parId = parent_id || null

  if (parId) {
    const parent = getDb().prepare('SELECT id FROM documents WHERE id = ? AND user_id = ?').get(parId, req.user.id)
    if (!parent) return res.status(400).json({ error: 'Documento pai não encontrado' })
  }

  const insert = getDb().prepare(
    'INSERT INTO documents (title, description, content, format, filename, original_name, file_size, user_id, category_id, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )

  const created = []

  for (const file of req.files) {
    const title = path.basename(file.originalname, path.extname(file.originalname))
    const format = detectFormat(file.originalname)
    const content = (format === 'txt' || format === 'md' || format === 'html')
      ? fs.readFileSync(file.path, 'utf-8')
      : ''

    const result = insert.run(
      title, '', content, format,
      file.filename, file.originalname, file.size,
      req.user.id, catId, parId
    )

    const doc = getDb()
      .prepare(`SELECT d.*, u.username as author, c.name as category_name, c.color as category_color,
                p.title as parent_title
                FROM documents d JOIN users u ON d.user_id = u.id
                LEFT JOIN categories c ON d.category_id = c.id
                LEFT JOIN documents p ON d.parent_id = p.id
                WHERE d.id = ?`)
      .get(result.lastInsertRowid)

    created.push(doc)
  }

  res.status(201).json({ documents: created, count: created.length })
})

router.post('/:id/share', (req, res) => {
  const doc = getDb()
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId obrigatorio' })

  if (Number(userId) === req.user.id) return res.status(400).json({ error: 'Voce ja e o proprietário' })

  const user = getDb().prepare('SELECT id, username FROM users WHERE id = ? AND active = 1').get(userId)
  if (!user) return res.status(404).json({ error: 'Usuario não encontrado' })

  try {
    getDb()
      .prepare('INSERT INTO document_shares (document_id, shared_with_user_id) VALUES (?, ?)')
      .run(doc.id, userId)
  } catch (_) {
    return res.status(409).json({ error: 'Documento ja compartilhado com este usuario' })
  }

  res.json({ message: `Compartilhado com ${user.username}` })
})

router.delete('/:id/share/:userId', (req, res) => {
  const doc = getDb()
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  getDb()
    .prepare('DELETE FROM document_shares WHERE document_id = ? AND shared_with_user_id = ?')
    .run(doc.id, req.params.userId)

  res.json({ message: 'Compartilhamento removido' })
})

router.get('/:id/shares', (req, res) => {
  const doc = getDb()
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  const userShares = getDb()
    .prepare('SELECT u.id, u.username, u.email, ds.created_at, \'user\' as type FROM document_shares ds JOIN users u ON ds.shared_with_user_id = u.id WHERE ds.document_id = ? ORDER BY u.username')
    .all(doc.id)

  const groupShares = getDb()
    .prepare('SELECT g.id, g.name as username, g.description as email, dgs.created_at, \'group\' as type, (SELECT COUNT(*) FROM user_groups WHERE group_id = g.id) as user_count FROM document_group_shares dgs JOIN groups g ON dgs.group_id = g.id WHERE dgs.document_id = ? ORDER BY g.name')
    .all(doc.id)

  res.json({ users: userShares, groups: groupShares })
})

router.post('/:id/share-group', (req, res) => {
  const doc = getDb()
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  const { groupId } = req.body
  if (!groupId) return res.status(400).json({ error: 'groupId obrigatorio' })

  const group = getDb().prepare('SELECT id, name FROM groups WHERE id = ?').get(groupId)
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' })

  try {
    getDb()
      .prepare('INSERT INTO document_group_shares (document_id, group_id) VALUES (?, ?)')
      .run(doc.id, groupId)
  } catch (_) {
    return res.status(409).json({ error: 'Documento ja compartilhado com este grupo' })
  }

  res.json({ message: `Compartilhado com grupo ${group.name}` })
})

router.delete('/:id/share-group/:groupId', (req, res) => {
  const doc = getDb()
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  getDb()
    .prepare('DELETE FROM document_group_shares WHERE document_id = ? AND group_id = ?')
    .run(doc.id, req.params.groupId)

  res.json({ message: 'Compartilhamento com grupo removido' })
})

router.post('/:id/public-link', (req, res) => {
  const doc = getDb()
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  let token = doc.public_token
  if (!token) {
    token = crypto.randomUUID()
    getDb()
      .prepare('UPDATE documents SET public_token = ? WHERE id = ?')
      .run(token, doc.id)
  }

  res.json({ token, url: `/api/public/d/${token}` })
})

router.delete('/:id/public-link', (req, res) => {
  const doc = getDb()
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  getDb()
    .prepare('UPDATE documents SET public_token = NULL WHERE id = ?')
    .run(doc.id)

  res.json({ message: 'Link público removido' })
})

router.get('/:id/download', (req, res) => {
  const doc = getAccessibleDocument(req.params.id, req.user.id)

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  if (doc.filename) {
    const filePath = path.join(UPLOAD_DIR, doc.filename)
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', getMimeType(doc.format, doc.filename || doc.original_name))
      res.setHeader('Content-Disposition', contentDisposition('inline', doc.original_name || doc.title))
      return fs.createReadStream(filePath).pipe(res)
    }
  }

  const mimeMap = {
    md: 'text/markdown',
    html: 'text/html',
    txt: 'text/plain',
  }

  const extMap = { md: 'md', html: 'html', txt: 'txt' }
  const ext = extMap[doc.format] || 'txt'
  const content = doc.content || ''

  res.setHeader('Content-Type', mimeMap[doc.format] || 'text/plain')
  res.setHeader('Content-Disposition', contentDisposition('attachment', `${doc.title}.${ext}`))
  res.send(content)
})

router.get('/:id/render', (req, res) => {
  const doc = getAccessibleDocument(req.params.id, req.user.id)

  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  let html = ''

  if (doc.format === 'md') {
    html = marked.parse(doc.content || '', {
      breaks: false,
      gfm: true,
    })
  } else if (doc.format === 'html') {
    html = doc.content || ''
  } else if (doc.format === 'txt') {
    html = `<pre class="doc-pre">${escapeHtml(doc.content || '')}</pre>`
  } else if (doc.filename) {
    const filePath = path.join(UPLOAD_DIR, doc.filename)
    if (fs.existsSync(filePath) && doc.format === 'image') {
      return res.json({ html: `<img src="/api/documents/${doc.id}/download" alt="${doc.title}" style="max-width:100%;border-radius:8px;cursor:pointer" onclick="this.requestFullscreen()" />`, format: 'image', isImage: true })
    }
    if (fs.existsSync(filePath) && doc.format === 'pdf') {
      return res.json({ html: `<p><a href="/api/documents/${doc.id}/download" target="_blank">Visualizar PDF</a></p>`, format: 'pdf' })
    }
    if (fs.existsSync(filePath) && doc.format === 'docx') {
      return res.json({ html: `<p><a href="/api/documents/${doc.id}/download" target="_blank">Download DOCX</a></p>`, format: 'docx' })
    }
  }

  const allowed = sanitizeHtml.defaults.allowedTags.concat([
    'img', 'h1', 'h2', 'figure', 'figcaption', 'video', 'source', 'audio',
    'pre', 'code', 'span', 'div', 'br', 'hr',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col', 'caption',
    'details', 'summary', 'dl', 'dt', 'dd',
    'kbd', 'mark', 'del', 'ins', 's', 'sup', 'sub', 'small',
    'input', 'label', 'abbr', 'dfn', 'var', 'samp',
  ])

  html = sanitizeHtml(html, {
    allowedTags: allowed,
    allowedAttributes: {
      '*': ['id', 'class', 'style', 'href', 'src', 'alt', 'target',
             'title', 'lang', 'dir', 'width', 'height', 'colspan',
             'rowspan', 'scope', 'start', 'reversed', 'type',
             'checked', 'disabled', 'readonly', 'open', 'controls',
             'autoplay', 'loop', 'muted', 'poster', 'loading'],
    },
  })

  const wrapped = `<div class="doc-content">${html}</div>`

  res.json({ html: wrapped, format: doc.format })
})

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default router
