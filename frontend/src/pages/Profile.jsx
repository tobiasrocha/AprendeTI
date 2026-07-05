import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { KeyRound, User, Fingerprint, ShieldCheck } from 'lucide-react'

function bufferToBase64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBuffer(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '==='.slice(0, (4 - base64.length % 4) % 4)
  const raw = atob(padded)
  const buf = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i)
  return buf.buffer
}

const webAuthnSupported = typeof window !== 'undefined' &&
  typeof window.PublicKeyCredential !== 'undefined'

export default function Profile() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [bioRegistered, setBioRegistered] = useState(false)
  const [bioChecking, setBioChecking] = useState(true)

  useEffect(() => {
    if (!webAuthnSupported || !user) return
    api.webauthnStatus(user.id)
      .then((r) => setBioRegistered(r.registered))
      .catch(() => {})
      .finally(() => setBioChecking(false))
  }, [user])

  async function handleRegisterBiometric() {
    setError('')
    setMessage('')
    try {
      const options = await api.webauthnRegisterOptions(user.id, user.username)
      options.challenge = base64urlToBuffer(options.challenge)
      options.user.id = base64urlToBuffer(options.user.id)
      if (options.excludeCredentials) {
        options.excludeCredentials = options.excludeCredentials.map((c) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        }))
      }

      const cred = await navigator.credentials.create({ publicKey: options })

      const credential = {
        id: cred.id,
        type: cred.type,
        response: {
          attestationObject: bufferToBase64url(cred.response.attestationObject),
          clientDataJSON: bufferToBase64url(cred.response.clientDataJSON),
        },
      }

      await api.webauthnRegister(user.id, credential)
      setBioRegistered(true)
      setMessage('Biometria cadastrada com sucesso!')
    } catch (err) {
      setError(err.message || 'Falha ao registrar biometria')
    }
  }

  async function handleRemoveBiometric() {
    if (!confirm('Remover o acesso biometrico?')) return
    try {
      await api.webauthnRemove(user.id)
      setBioRegistered(false)
      setMessage('Biometria removida')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setError('')
    setMessage('')

    if (newPassword !== confirmPassword) {
      return setError('Senhas não conferem')
    }

    if (newPassword.length < 6) {
      return setError('Senha deve ter no mínimo 6 caracteres')
    }

    setSaving(true)
    try {
      await api.changePassword(currentPassword, newPassword)
      setMessage('Senha alterada com sucesso!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Meu Perfil</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, maxWidth: 700 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 12,
              background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--primary)',
            }}>
              <User size={28} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{user?.username}</h3>
              <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)' }}>{user?.email}</p>
              <span className={`badge ${user?.role === 'admin' ? 'badge-purple' : 'badge-blue'}`} style={{ marginTop: 4 }}>
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <KeyRound size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Trocar Senha</h3>
          </div>

          {message && <div className="alert alert-success">{message}</div>}
          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label>Senha atual</label>
              <input className="form-input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Nova senha</label>
              <input className="form-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="form-group">
              <label>Confirmar nova senha</label>
              <input className="form-input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <KeyRound size={16} />
              {saving ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </form>
        </div>

        {webAuthnSupported && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Fingerprint size={20} style={{ color: 'var(--primary)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Biometria</h3>
            </div>
            {bioChecking ? (
              <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)' }}>Verificando...</p>
            ) : bioRegistered ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <ShieldCheck size={16} style={{ color: 'var(--success)' }} />
                  <span style={{ fontSize: '.8125rem', color: 'var(--success)', fontWeight: 500 }}>
                    Cadastrada
                  </span>
                </div>
                <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                  Use sua digital ou Face ID para acessar o sistema no celular.
                </p>
                <button className="btn btn-outline btn-sm" onClick={handleRemoveBiometric}>
                  Remover biometria
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                  Cadastre sua digital ou Face ID para login rapido no celular.
                </p>
                <button className="btn btn-primary btn-sm" onClick={handleRegisterBiometric}>
                  <Fingerprint size={14} /> Cadastrar biometria
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
