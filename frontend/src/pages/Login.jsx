import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { BookOpen, Lock, Fingerprint } from 'lucide-react'

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
        console.error('WebAuthn error:', webAuthnErr)
        setLoading(false)
        setError('Falha ao acessar o autenticador. Verifique se o PIN/biometria esta configurado no sistema.')
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
      setError(err.message || 'Falha na autenticação. Use usuário e senha.')
    } finally {
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

        {webAuthnSupported && (
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
