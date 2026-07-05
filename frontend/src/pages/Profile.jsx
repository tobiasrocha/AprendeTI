import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { KeyRound, User, Fingerprint, ShieldCheck, Trash2, Plus, Loader, Check, AlertTriangle, X as XIcon } from 'lucide-react'

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

const FINGER_LABELS = [
  'Polegar direito', 'Indicador direito', 'Medio direito',
  'Anelar direito', 'Minimo direito',
  'Polegar esquerdo', 'Indicador esquerdo', 'Medio esquerdo',
  'Anelar esquerdo', 'Minimo esquerdo',
]

const SCAN_POSITIONS = [
  'Encoste a ponta do dedo centralizada no leitor',
  'Encoste a parte superior do dedo',
  'Encoste a lateral direita do dedo',
  'Encoste a lateral esquerda do dedo',
  'Encoste a base do dedo',
  'Encoste o dedo levemente inclinado para direita',
  'Encoste o dedo levemente inclinado para esquerda',
  'Encoste mais pressao no centro do dedo',
  'Encoste o dedo com leve toque na ponta',
  'Encoste a digital completa cobrindo todo o leitor',
]

const VERIFICATIONS_PER_FINGER = 10

export default function Profile() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [credentials, setCredentials] = useState([])
  const [bioLoading, setBioLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyProgress, setVerifyProgress] = useState(0)
  const [verifyTotal, setVerifyTotal] = useState(0)
  const [verifyOk, setVerifyOk] = useState(0)
  const [verifyFail, setVerifyFail] = useState(0)
  const [currentFingerLabel, setCurrentFingerLabel] = useState('')
  const [scanHint, setScanHint] = useState('')

  useEffect(() => {
    if (!webAuthnSupported || !user) return
    api.webauthnCredentials(user.id)
      .then(setCredentials)
      .catch(() => {})
      .finally(() => setBioLoading(false))
  }, [user])

  async function startFingerRegistration() {
    if (registering || verifying) return
    setError('')
    setMessage('')
    setVerifyError('')

    const takenLabels = new Set(credentials.map((c) => c.device_name))
    const label = FINGER_LABELS.find((l) => !takenLabels.has(l)) || `Dedo ${credentials.length + 1}`

    setCurrentFingerLabel(label)
    setRegistering(true)

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

      let cred
      try {
        cred = await navigator.credentials.create({ publicKey: options })
      } catch (webAuthnErr) {
        console.error('Create error:', webAuthnErr)
        setRegistering(false)
        setError('Coleta cancelada ou falhou. Tente novamente.')
        return
      }

      const credential = {
        id: cred.id,
        type: cred.type,
        response: {
          attestationObject: bufferToBase64url(cred.response.attestationObject),
          clientDataJSON: bufferToBase64url(cred.response.clientDataJSON),
        },
      }

      await api.webauthnRegister(user.id, credential, label)
      setRegistering(false)

      await new Promise((r) => setTimeout(r, 800))

      await runVerifications(label)
    } catch (err) {
      setRegistering(false)
      setVerifying(false)
      setError(err.message || 'Falha ao registrar biometria')
    }
  }

  async function runVerifications(label) {
    setVerifying(true)
    setVerifyProgress(0)
    setVerifyTotal(VERIFICATIONS_PER_FINGER)
    setVerifyOk(0)
    setVerifyFail(0)
    setScanHint('')

    let collected = 0
    let retries = 0
    const MAX_RETRIES = 30

    while (collected < VERIFICATIONS_PER_FINGER && retries < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 500))
      setScanHint(SCAN_POSITIONS[collected] || `Leitura ${collected + 1} de ${VERIFICATIONS_PER_FINGER}`)

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
        } catch (getErr) {
          console.error('credentials.get failed:', getErr.message)
          retries++
          setVerifyFail((f) => f + 1)
          continue
        }

        const credPayload = {
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

        try {
          await api.webauthnVerify(credPayload)
          collected++
          setVerifyProgress(collected)
          setVerifyOk((o) => o + 1)
        } catch (verifyErr) {
          console.error('Server verify failed:', verifyErr.message)
          retries++
          setVerifyFail((f) => f + 1)
        }
      } catch (err) {
        console.error('Verification round error:', err.message)
        retries++
        setVerifyFail((f) => f + 1)
      }
    }

    setVerifying(false)

    if (collected >= VERIFICATIONS_PER_FINGER) {
      setMessage(`Digital "${label}" cadastrada com sucesso! ${collected} leituras validadas.`)
    } else {
      setError(`Coleta parcial: ${collected} de ${VERIFICATIONS_PER_FINGER} leituras concluidas. Recomendamos recadastrar o dedo para melhor precisao.`)
    }

    setScanHint('')
    refreshCredentials()
  }

  function refreshCredentials() {
    api.webauthnCredentials(user.id)
      .then(setCredentials)
      .catch(() => {})
  }

  async function removeFinger(cred) {
    try {
      await api.webauthnRemoveCredential(cred.id)
      refreshCredentials()
      setMessage(`Digital "${cred.device_name}" removida.`)
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

  const hasCredentials = credentials.length > 0
  const canAddMore = credentials.length < 10 && webAuthnSupported
  const isBusy = registering || verifying

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
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <Fingerprint size={20} style={{ color: 'var(--primary)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Biometria</h3>
            </div>

            {bioLoading ? (
              <p style={{ fontSize: '.8125rem', color: 'var(--text-muted)' }}>Verificando...</p>
            ) : (
              <div>
                {verifying && (
                  <div className="biometric-verify-progress">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <Loader size={16} className="spin" style={{ color: 'var(--primary)' }} />
                      <span style={{ fontWeight: 600, fontSize: '.875rem' }}>
                        Coletando "{currentFingerLabel}"
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.round((verifyProgress / verifyTotal) * 100)}%` }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '.75rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        {scanHint}
                      </span>
                      <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--success)' }}>&#10003; {verifyOk}</span>
                        {verifyFail > 0 && <span style={{ color: 'var(--danger)', marginLeft: 10 }}>&#10007; {verifyFail}</span>}
                      </span>
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Leitura {verifyProgress} de {verifyTotal}
                    </div>
                  </div>
                )}

                {registering && !verifying && (
                  <div style={{ padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Loader size={16} className="spin" style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: '.875rem' }}>Posicione o dedo no leitor para cadastrar "{currentFingerLabel}"...</span>
                  </div>
                )}

                {!isBusy && hasCredentials && (
                  <div className="finger-list">
                    {credentials.map((cred) => (
                      <div key={cred.id} className="finger-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#166534', flexShrink: 0,
                          }}>
                            <Check size={16} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '.875rem' }}>{cred.device_name}</div>
                            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
                              {cred.sign_count} acessos &middot; {new Date(cred.created_at).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                        </div>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => removeFinger(cred)}
                          title="Remover esta digital"
                          style={{ color: 'var(--danger)', borderColor: 'var(--danger)', flexShrink: 0 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {!isBusy && !hasCredentials && (
                  <div style={{ padding: '8px 0 16px' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                      padding: '10px 14px', background: '#fef9c3', borderRadius: 8,
                      border: '1px solid #fde68a', fontSize: '.8125rem',
                    }}>
                      <Fingerprint size={16} style={{ color: '#854d0e', flexShrink: 0 }} />
                      <span style={{ color: '#713f12' }}>
                        Nenhuma digital cadastrada. Adicione para login rapido no celular.
                      </span>
                    </div>
                  </div>
                )}

                {!isBusy && canAddMore && (
                  <button className="btn btn-primary btn-sm" onClick={startFingerRegistration}>
                    <Plus size={14} /> {hasCredentials ? 'Adicionar outro dedo' : 'Cadastrar digital'}
                  </button>
                )}

                {!isBusy && !canAddMore && hasCredentials && (
                  <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                    Todos os 10 dedos cadastrados.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
