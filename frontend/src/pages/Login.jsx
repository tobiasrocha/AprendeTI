import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { BookOpen, Lock, Fingerprint, User } from 'lucide-react'

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

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [bioMode, setBioMode] = useState(false)
  const [bioUsername, setBioUsername] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleBiometric() {
    setError('')
    setLoading(true)
    setBioMode(false)

    try {
      const challengeRes = await api.webauthnLoginDiscoverOptions()
      const publicKey = {
        challenge: base64urlToBuffer(challengeRes.challenge),
        rpId: challengeRes.rpId,
        timeout: 60000,
        userVerification: 'required',
      }

      let assertion
      try {
        assertion = await navigator.credentials.get({ publicKey })
      } catch (webAuthnErr) {
        console.error('WebAuthn discover error:', webAuthnErr)
        setBioMode(true)
        setLoading(false)
        return
      }

      const credential = {
        id: assertion.id,
        type: assertion.type,
        response: {
          authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
          clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
          signature: bufferToBase64url(assertion.response.signature),
          userHandle: assertion.response.userHandle
            ? bufferToBase64url(assertion.response.userHandle)
            : null,
        },
      }

      const result = await api.webauthnLoginDiscover(credential)
      localStorage.setItem('token', result.token)
      localStorage.setItem('user', JSON.stringify(result.user))
      navigate('/')
    } catch (err) {
      setError(err.message || 'Falha na autenticação biometrica. Use usuario e senha.')
      setLoading(false)
    }
  }

  async function handleBiometricWithUsername(e) {
    e.preventDefault()
    if (!bioUsername.trim()) return

    setError('')
    setLoading(true)
    setBioMode(false)

    try {
      const optionsRes = await api.webauthnLoginOptions(bioUsername.trim())

      const publicKey = {
        challenge: base64urlToBuffer(optionsRes.challenge),
        rpId: optionsRes.rpId,
        timeout: 60000,
        userVerification: 'required',
        allowCredentials: optionsRes.allowCredentials.map((c) => ({
          type: c.type,
          id: base64urlToBuffer(c.id),
        })),
      }

      let assertion
      try {
        assertion = await navigator.credentials.get({ publicKey })
      } catch (webAuthnErr) {
        console.error('WebAuthn login error:', webAuthnErr)
        setLoading(false)
        setError('Falha ao acessar o autenticador. Verifique se o PIN/biometria esta configurado.')
        setBioMode(true)
        return
      }

      const credential = {
        id: assertion.id,
        type: assertion.type,
        response: {
          authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
          clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
          signature: bufferToBase64url(assertion.response.signature),
          userHandle: assertion.response.userHandle
            ? bufferToBase64url(assertion.response.userHandle)
            : null,
        },
      }

      const result = await api.webauthnLogin(bioUsername.trim(), credential)
      localStorage.setItem('token', result.token)
      localStorage.setItem('user', JSON.stringify(result.user))
      navigate('/')
    } catch (err) {
      setError(err.message || 'Falha na autenticação')
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <BookOpen size={28} />
          Repositório AprendeTI
        </div>
        <p className="login-sub">Acesse o repositório de conhecimento</p>

        {error && <div className="alert alert-error">{error}</div>}

        {webAuthnSupported && !bioMode && (
          <button
            className="btn btn-outline"
            style={{ width: '100%', marginBottom: 16, padding: '12px' }}
            onClick={handleBiometric}
            disabled={loading}
          >
            <Fingerprint size={20} />
            Entrar com Biometria ou PIN
          </button>
        )}

        {bioMode && (
          <div style={{
            padding: 16, background: 'var(--primary-light)', borderRadius: 10,
            border: '1px solid var(--border)', marginBottom: 16,
          }}>
            <p style={{ fontSize: '.8125rem', marginBottom: 12, textAlign: 'center', color: 'var(--text-muted)' }}>
              Nenhuma chave de acesso encontrada. Informe seu usuario para buscar suas digitais cadastradas.
            </p>
            <form onSubmit={handleBiometricWithUsername}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  type="text"
                  value={bioUsername}
                  onChange={(e) => setBioUsername(e.target.value)}
                  placeholder="Seu usuário"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  style={{ flex: 1 }}
                  autoFocus
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={loading || !bioUsername.trim()}>
                  <Fingerprint size={16} /> Verificar
                </button>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => { setBioMode(false); setError('') }}
                disabled={loading}
              >
                Cancelar
              </button>
            </form>
          </div>
        )}

        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.75rem', marginBottom: 16 }}>
          ou use seu usuário e senha
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Usuário</label>
            <input
              className="form-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Seu usuário"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label>Senha</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha"
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            <Lock size={16} />
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
