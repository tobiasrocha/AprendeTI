import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'
import { getDb } from '../database.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')

const router = Router()

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

function contentDisposition(disposition, filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/\s+/g, '_').substring(0, 200) || 'arquivo'
  const encoded = encodeURIComponent(filename)
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function getPublicDoc(token) {
  return getDb()
    .prepare(`SELECT d.*, u.username as author, c.name as category_name, c.color as category_color
              FROM documents d
              JOIN users u ON d.user_id = u.id
              LEFT JOIN categories c ON d.category_id = c.id
              WHERE d.public_token = ?`)
    .get(token)
}

function renderDocContent(doc, token) {
  if (doc.format === 'md') {
    return marked.parse(doc.content || '', { breaks: false, gfm: true })
  }
  if (doc.format === 'html') {
    return doc.content || ''
  }
  if (doc.format === 'txt') {
    return `<pre class="doc-pre">${escapeHtml(doc.content || '')}</pre>`
  }
  if (doc.filename) {
    const filePath = path.join(UPLOAD_DIR, doc.filename)
    if (fs.existsSync(filePath) && doc.format === 'image') {
      return `<img src="/api/public/d/${token}/download" alt="${escapeHtml(doc.title)}" style="max-width:100%;border-radius:8px">`
    }
    if (fs.existsSync(filePath) && doc.format === 'pdf') {
      return `<iframe src="/api/public/d/${token}/download" title="${escapeHtml(doc.title)}"></iframe>`
    }
    if (fs.existsSync(filePath) && doc.format === 'docx') {
      return `<p><a href="/api/public/d/${token}/download" target="_blank">Download DOCX</a></p>`
    }
  }
  return ''
}

function sanitizeDocHtml(rawHtml) {
  const allowed = sanitizeHtml.defaults.allowedTags.concat([
    'img', 'h1', 'h2', 'figure', 'figcaption', 'video', 'source', 'audio',
    'pre', 'code', 'span', 'div', 'br', 'hr',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col', 'caption',
    'details', 'summary', 'dl', 'dt', 'dd',
    'kbd', 'mark', 'del', 'ins', 's', 'sup', 'sub', 'small',
    'input', 'label', 'abbr', 'dfn', 'var', 'samp',
  ])
  return sanitizeHtml(rawHtml, {
    allowedTags: allowed,
    allowedAttributes: {
      '*': ['id', 'class', 'style', 'href', 'src', 'alt', 'target',
             'title', 'lang', 'dir', 'width', 'height', 'colspan',
             'rowspan', 'scope', 'start', 'reversed', 'type',
             'checked', 'disabled', 'readonly', 'open', 'controls',
             'autoplay', 'loop', 'muted', 'poster', 'loading'],
    },
  })
}

const PUBLIC_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.7;-webkit-font-smoothing:antialiased;padding:24px}
.container{max-width:860px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:40px}
.header{margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #e2e8f0}
.header h1{font-size:1.75rem;font-weight:700;letter-spacing:-.02em}
.header .meta{display:flex;gap:16px;flex-wrap:wrap;font-size:.8125rem;color:#64748b;margin-top:8px}
.badge{display:inline-flex;padding:2px 10px;border-radius:100px;font-size:.75rem;font-weight:600}
.badge-blue{background:#dbeafe;color:#1e40af}
.badge-red{background:#fee2e2;color:#991b1b}
.badge-green{background:#dcfce7;color:#166534}
.badge-purple{background:#ede9fe;color:#6b21a8}
.badge-yellow{background:#fef9c3;color:#854d0e}
.badge-orange{background:#fff7ed;color:#9a3412}
.content{font-size:var(--doc-font-size,.95rem)}
.content h1{font-size:1.5rem;font-weight:700;margin:28px 0 14px}
.content h2{font-size:1.2rem;font-weight:700;margin:24px 0 12px}
.content h3{font-size:1rem;font-weight:600;margin:20px 0 10px}
.content p{margin-bottom:14px}
.content a{color:#3b82f6;text-decoration:underline}
.content ul,.content ol{margin:0 0 14px;padding-left:24px}
.content li{margin-bottom:4px}
.content pre{background:#1e293b;color:#e2e8f0;border-radius:10px;padding:18px 22px;overflow-x:auto;margin:18px 0;font-size:.8125rem;line-height:1.65}
.content code{background:#f1f5f9;padding:2px 7px;border-radius:4px;font-family:monospace;font-size:.8125rem;color:#3b82f6;border:1px solid #e2e8f0}
.content pre code{background:none;padding:0;border:none;color:#e2e8f0}
.content img{max-width:100%;border-radius:8px;margin:12px 0;border:1px solid #e2e8f0;cursor:pointer}
.content blockquote{border-left:4px solid #3b82f6;background:#eff6ff;padding:14px 20px;margin:18px 0;border-radius:0 8px 8px 0}
.content table{width:100%;border-collapse:collapse;margin:18px 0;font-size:.875rem;border:1px solid #e2e8f0}
.content th{background:#eff6ff;padding:10px 14px;text-align:left;font-weight:600;font-size:.8125rem;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0}
.content td{padding:10px 14px;border-top:1px solid #e2e8f0}
.content iframe{width:100%;height:80vh;border:1px solid #e2e8f0;border-radius:8px;margin:12px 0}
.footer{margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:.75rem;color:#94a3b8;text-align:center}
.toolbar{position:fixed;top:16px;right:16px;z-index:999;display:flex;gap:4px;background:rgba(255,255,255,.95);border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.1);padding:4px;backdrop-filter:blur(8px);border:1px solid #e2e8f0;transition:opacity .3s,transform .3s}
.toolbar.hidden{opacity:0;pointer-events:none;transform:translateY(-10px)}
.toolbar button{width:36px;height:36px;border-radius:6px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#64748b;font-weight:700;transition:all .15s}
.toolbar button:hover{background:#eff6ff;color:#3b82f6}
.toolbar .sep{width:1px;background:#e2e8f0;margin:4px 0}
@media(max-width:640px){body{padding:12px}.container{padding:20px}.header h1{font-size:1.35rem}.toolbar{top:8px;right:8px}}
@media print{.toolbar{display:none!important}}
`

const PUBLIC_JS = `
let fontSize=15;
function setFont(s){fontSize=Math.max(10,Math.min(28,s));document.documentElement.style.setProperty('--doc-font-size',fontSize+'px');document.getElementById('fontLabel').textContent=fontSize+'px'}
function zoomIn(){setFont(fontSize+2)}
function zoomOut(){setFont(fontSize-2)}
function zoomReset(){setFont(15)}
function toggleFS(){if(!document.fullscreenElement){document.documentElement.requestFullscreen().catch(()=>{})}else{document.exitFullscreen()}}
(function(){
  var tb=document.querySelector('.toolbar'),hideTimer;
  function show(){tb.classList.remove('hidden');clearTimeout(hideTimer);hideTimer=setTimeout(function(){tb.classList.add('hidden')},3000)}
  function onScroll(){tb.classList.add('hidden');clearTimeout(hideTimer)}
  window.addEventListener('scroll',onScroll,{passive:true});
  document.addEventListener('click',function(){show()});
  document.addEventListener('touchstart',function(){show()});
  show();
})()
`

function renderPage(doc, bodyHtml, token) {
  const badge = `badge-${doc.format === 'md' ? 'blue' : doc.format === 'pdf' ? 'red' : doc.format === 'docx' ? 'purple' : doc.format === 'html' ? 'green' : doc.format === 'image' ? 'orange' : 'yellow'}`
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(doc.title)} - AprendeTI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${PUBLIC_CSS}</style>
</head>
<body>
<div class="toolbar">
<button onclick="zoomOut()" title="Diminuir fonte"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
<span id="fontLabel" style="font-size:.7rem;font-weight:600;color:#64748b;min-width:36px;text-align:center;line-height:36px">15px</span>
<button onclick="zoomIn()" title="Aumentar fonte"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
<button onclick="zoomReset()" title="Restaurar"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>
<div class="sep"></div>
<button onclick="toggleFS()" title="Tela cheia"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>
</div>
<div class="container">
<div class="header">
<h1>${escapeHtml(doc.title)}</h1>
<div class="meta">
<span class="badge ${badge}">${doc.format.toUpperCase()}</span>
${doc.category_name ? `<span class="badge badge-blue">${escapeHtml(doc.category_name)}</span>` : ''}
<span>Autor: ${escapeHtml(doc.author)}</span>
<span>Criado: ${new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
<span>Atualizado: ${new Date(doc.updated_at).toLocaleDateString('pt-BR')}</span>
</div>
${doc.description ? `<p style="color:#64748b;margin-top:12px">${escapeHtml(doc.description)}</p>` : ''}
</div>
<div class="content">${bodyHtml}</div>
<div class="footer">Compartilhado via Repositorio AprendeTI</div>
</div>
<script>${PUBLIC_JS}</script>
</body>
</html>`
}

const NOT_FOUND_PAGE = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Não encontrado - AprendeTI</title><style>${PUBLIC_CSS}</style></head>
<body>
<div class="container" style="text-align:center;padding:80px 40px">
<h1 style="font-size:3rem;color:#ef4444;margin-bottom:16px">404</h1>
<p style="color:#64748b;font-size:1rem">Documento não encontrado ou link inválido.</p>
</div>
</body>
</html>`

router.get('/d/:token', (req, res) => {
  const doc = getPublicDoc(req.params.token)
  if (!doc) return res.status(404).type('html').send(NOT_FOUND_PAGE)

  const children = getDb()
    .prepare('SELECT id, title, format FROM documents WHERE parent_id = ? ORDER BY title')
    .all(doc.id)

  const acceptsHtml = req.accepts('html') === 'html'

  if (!acceptsHtml) {
    return res.json({ ...doc, children })
  }

  const rawHtml = renderDocContent(doc, req.params.token)
  const cleanHtml = sanitizeDocHtml(rawHtml)
  const wrapped = `<div class="doc-content">${cleanHtml}</div>`

  let html = wrapped
  if (children.length > 0) {
    html += `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0"><h3>Subdocumentos</h3><ul>`
    for (const child of children) {
      html += `<li><a href="/api/public/d/${req.params.token}">${escapeHtml(child.title)}</a></li>`
    }
    html += `</ul></div>`
  }

  res.type('html').send(renderPage(doc, html, req.params.token))
})

router.get('/d/:token/download', (req, res) => {
  const doc = getPublicDoc(req.params.token)
  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  if (doc.filename) {
    const filePath = path.join(UPLOAD_DIR, doc.filename)
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', getMimeType(doc.format, doc.filename || doc.original_name))
      res.setHeader('Content-Disposition', contentDisposition('inline', doc.original_name || doc.title))
      return fs.createReadStream(filePath).pipe(res)
    }
  }

  const mimeMap = { md: 'text/markdown', html: 'text/html', txt: 'text/plain' }
  const extMap = { md: 'md', html: 'html', txt: 'txt' }
  const ext = extMap[doc.format] || 'txt'
  res.setHeader('Content-Type', mimeMap[doc.format] || 'text/plain')
  res.setHeader('Content-Disposition', contentDisposition('attachment', `${doc.title}.${ext}`))
  res.send(doc.content || '')
})

router.get('/d/:token/render', (req, res) => {
  const doc = getPublicDoc(req.params.token)
  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' })

  const rawHtml = renderDocContent(doc, req.params.token)
  const cleanHtml = sanitizeDocHtml(rawHtml)
  const wrapped = `<div class="doc-content">${cleanHtml}</div>`

  res.json({ html: wrapped, format: doc.format })
})

export default router
