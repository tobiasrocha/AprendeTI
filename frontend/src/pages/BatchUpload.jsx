import { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Upload, X, FileText, FolderTree } from 'lucide-react'

const FORMAT_LABELS = {
  pdf: 'PDF', html: 'HTML', docx: 'DOCX', md: 'Markdown', txt: 'Texto',
}

export default function BatchUpload({ onClose, onSuccess }) {
  const [files, setFiles] = useState([])
  const [categories, setCategories] = useState([])
  const [documents, setDocuments] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [parentId, setParentId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {})
    api.getDocuments({ limit: 500 }).then((d) => setDocuments(d.documents)).catch(() => {})
  }, [])

  function detectFormat(filename) {
    const ext = filename.split('.').pop().toLowerCase()
    const map = { pdf: 'pdf', html: 'html', htm: 'html', docx: 'docx', md: 'md', txt: 'txt' }
    return map[ext] || 'txt'
  }

  function titleFromName(filename) {
    return filename.replace(/\.[^.]+$/, '')
  }

  function handleFiles(e) {
    const selected = Array.from(e.target.files)
    const withMeta = selected.map((f) => ({
      file: f,
      title: titleFromName(f.name),
      format: detectFormat(f.name),
      size: f.size,
    }))
    setFiles((prev) => [...prev, ...withMeta])
    setError('')
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleUpload() {
    if (files.length === 0) return setError('Selecione pelo menos um arquivo')
    setUploading(true)
    setError('')
    try {
      const raw = files.map((f) => f.file)
      const result = await api.uploadDocumentsBatch(raw, categoryId || undefined, parentId || undefined)
      onSuccess(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  const parents = documents.filter((d) => !d.parent_id)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <h2>Envio em Lote</h2>

        {error && <div className="alert alert-error">{error}</div>}

        <div
          className="drop-zone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover') }}
          onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
          onDrop={(e) => {
            e.preventDefault()
            e.currentTarget.classList.remove('dragover')
            const dt = e.dataTransfer
            if (dt.files.length) {
              const fakeEvent = { target: { files: dt.files } }
              handleFiles(fakeEvent)
            }
          }}
        >
          <Upload size={28} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
          <p style={{ fontSize: '.875rem', color: 'var(--text-muted)' }}>
            Arraste arquivos ou clique para selecionar
          </p>
          <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            PDF, HTML, DOCX, MD, TXT &bull; Max 50MB cada
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.html,.htm,.docx,.md,.txt"
            style={{ display: 'none' }}
            onChange={handleFiles}
          />
        </div>

        {files.length > 0 && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '.8125rem', fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
                {files.length} arquivo(s) selecionado(s)
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                {files.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderBottom: '1px solid var(--border)',
                      fontSize: '.8125rem',
                    }}
                  >
                    <FileText size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.title}
                      </div>
                      <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
                        {FORMAT_LABELS[f.format] || f.format} &bull; {formatSize(f.size)}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(i)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: 2,
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label>Categoria (opcional)</label>
                <select
                  className="form-select"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Sem categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>Documento Pai (opcional)</label>
                <select
                  className="form-select"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                >
                  <option value="">Nenhum</option>
                  {parents.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
          >
            <Upload size={14} />
            {uploading ? 'Enviando...' : `Enviar ${files.length} documento(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}
