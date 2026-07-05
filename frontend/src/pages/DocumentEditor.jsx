import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Save, ArrowLeft, Upload } from 'lucide-react'

const FORMATS = [
  { value: 'md', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'txt', label: 'Texto (TXT)' },
  { value: 'pdf', label: 'PDF (upload)' },
  { value: 'docx', label: 'DOCX (upload)' },
]

export default function DocumentEditor() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [format, setFormat] = useState('md')
  const [categoryId, setCategoryId] = useState('')
  const [parentId, setParentId] = useState('')
  const [categories, setCategories] = useState([])
  const [availableDocs, setAvailableDocs] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [file, setFile] = useState(null)

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {})
    api.getDocuments({ limit: 200 }).then((d) => setAvailableDocs(d.documents)).catch(() => {})

    if (id) {
      api.getDocument(id).then((doc) => {
        setTitle(doc.title)
        setDescription(doc.description || '')
        setContent(doc.content || '')
        setFormat(doc.format)
        setCategoryId(doc.category_id || '')
        setParentId(doc.parent_id || '')
      })
    }
  }, [id])

  async function handleSave(e) {
    e.preventDefault()
    if (!title.trim()) return setError('Título obrigatório')
    setSaving(true)
    setError('')

    try {
      let doc
      if (isEdit) {
        doc = await api.updateDocument(id, { title, description, content, format, category_id: categoryId || null, parent_id: parentId || null })
      } else {
        doc = await api.createDocument({ title, description, content, format, category_id: categoryId || null, parent_id: parentId || null })
      }

      if (file && doc?.id) {
        await api.uploadDocumentFile(doc.id, file)
      }

      navigate(`/documents/${doc?.id || id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const isUploadOnly = format === 'pdf' || format === 'docx'

  return (
    <div>
      <div className="page-header">
        <h1>{isEdit ? 'Editar Documento' : 'Novo Documento'}</h1>
        <button className="btn btn-outline" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Voltar
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSave}>
        <div className="form-group">
          <label>Titulo *</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titulo do documento" required />
        </div>

        <div className="form-group">
          <label>Descricao</label>
          <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descrição" />
        </div>

        <div className="form-group">
          <label>Formato</label>
          <select className="form-select" value={format} onChange={(e) => setFormat(e.target.value)}>
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Categoria</label>
          <select className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Documento Pai</label>
          <select className="form-select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Nenhum (raiz)</option>
            {availableDocs
              .filter((d) => String(d.id) !== String(id))
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                  {d.parent_title ? ` ← ${d.parent_title}` : ''}
                </option>
              ))}
          </select>
          <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Torna este documento um subdocumento do selecionado
          </p>
        </div>

        <div className="form-group">
          <label>Arquivo {isUploadOnly ? '*' : '(opcional)'}</label>
          <input
            type="file"
            className="form-input"
            accept=".pdf,.html,.htm,.docx,.md,.txt"
            onChange={(e) => setFile(e.target.files[0])}
          />
          {isEdit && !file && (
            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Deixe vazio para manter o arquivo atual
            </p>
          )}
        </div>

        {!isUploadOnly && (
          <div className="form-group">
            <label>Conteudo {format === 'md' && '(Markdown)'}</label>
            <textarea
              className="form-textarea"
              rows={18}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={format === 'md' ? '# Titulo\n\nConteudo em **Markdown**...' : 'Conteudo do documento...'}
            />
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Save size={16} />
          {saving ? 'Salvando...' : 'Salvar Documento'}
        </button>
      </form>
    </div>
  )
}
