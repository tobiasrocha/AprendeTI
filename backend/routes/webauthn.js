import { Router } from 'express'
import { getDb } from '../database.js'
import { generateChallenge, parseAttestation, verifyAssertion, bufferToBase64url } from '../utils/webauthn.js'
import { generateToken } from '../middleware/auth.js'

const router = Router()
const RP_NAME = 'AprendeTI'
const RP_ID = 'aprendeti.uman-app.uk'
const ORIGIN = 'https://aprendeti.uman-app.uk'

router.post('/register/options', (req, res) => {
  const { userId, username } = req.body
  if (!userId || !username) return res.status(400).json({ error: 'userId e username obrigatórios' })

  const existing = getDb()
    .prepare('SELECT credential_id FROM webauthn_credentials WHERE user_id = ?')
    .all(userId)

  const challenge = generateChallenge()

  res.json({
    rp: { name: RP_NAME, id: RP_ID },
    user: {
      id: bufferToBase64url(String(userId)),
      name: username,
      displayName: username,
    },
    challenge,
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    timeout: 60000,
    attestation: 'none',
    excludeCredentials: existing.map((c) => ({
      type: 'public-key',
      id: c.credential_id,
    })),
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'required',
    },
  })
})

router.post('/register', (req, res) => {
  const { userId, credential } = req.body
  if (!userId || !credential) return res.status(400).json({ error: 'Dados obrigatórios' })

  try {
    const { response } = credential
    const authData = parseAttestation(response.attestationObject)

    if (!authData.credentialId || !authData.publicKeyPem) {
      return res.status(400).json({ error: 'Falha ao extrair chave publica' })
    }

    const credIdB64 = bufferToBase64url(authData.credentialId)

    getDb()
      .prepare('INSERT OR REPLACE INTO webauthn_credentials (user_id, credential_id, public_key_pem, sign_count, device_name) VALUES (?, ?, ?, ?, ?)')
      .run(userId, credIdB64, authData.publicKeyPem, 0, 'Dispositivo movel')

    res.json({ success: true, credentialId: credIdB64 })
  } catch (e) {
    console.error('WebAuthn register error:', e)
    res.status(400).json({ error: 'Falha ao registrar biometria: ' + e.message })
  }
})

router.post('/login/options', (req, res) => {
  const { username } = req.body

  const user = getDb()
    .prepare('SELECT id FROM users WHERE username = ? AND active = 1')
    .get(username)

  if (!user) return res.status(404).json({ error: 'Usuario não encontrado' })

  const credentials = getDb()
    .prepare('SELECT credential_id FROM webauthn_credentials WHERE user_id = ?')
    .all(user.id)

  if (credentials.length === 0) {
    return res.status(404).json({ error: 'Nenhuma biometria cadastrada' })
  }

  const challenge = generateChallenge()

  res.json({
    challenge,
    rpId: RP_ID,
    allowCredentials: credentials.map((c) => ({
      type: 'public-key',
      id: c.credential_id,
    })),
    timeout: 60000,
    userVerification: 'required',
  })
})

router.post('/login', (req, res) => {
  const { username, credential } = req.body
  if (!username || !credential) return res.status(400).json({ error: 'Dados obrigatórios' })

  try {
    const credId = credential.id
    const { response } = credential

    const stored = getDb()
      .prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ?')
      .get(credId)

    if (!stored) return res.status(400).json({ error: 'Credencial não encontrada' })

    const ok = verifyAssertion(
      stored,
      response.clientDataJSON,
      response.authenticatorData,
      response.signature,
    )

    if (!ok) return res.status(401).json({ error: 'Falha na verificação biometrica' })

    getDb()
      .prepare('UPDATE webauthn_credentials SET sign_count = sign_count + 1 WHERE id = ?')
      .run(stored.id)

    const dbUser = getDb()
      .prepare('SELECT id, username, email, role FROM users WHERE id = ?')
      .get(stored.user_id)

    const token = generateToken(dbUser)

    res.json({ token, user: dbUser })
  } catch (e) {
    console.error('WebAuthn login error:', e)
    res.status(401).json({ error: 'Falha na autenticação biometrica: ' + e.message })
  }
})

router.get('/status/:userId', (req, res) => {
  const count = getDb()
    .prepare('SELECT COUNT(*) as c FROM webauthn_credentials WHERE user_id = ?')
    .get(req.params.userId)

  res.json({ registered: count.c > 0 })
})

router.post('/login-discover-options', (_req, res) => {
  const challenge = generateChallenge()
  res.json({ challenge, rpId: RP_ID })
})

router.post('/login-discover', (req, res) => {
  const { credential } = req.body
  if (!credential) return res.status(400).json({ error: 'Dados obrigatórios' })

  try {
    const credId = credential.id
    const { response } = credential

    const stored = getDb()
      .prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ?')
      .get(credId)

    if (!stored) return res.status(400).json({ error: 'Credencial biometrica não encontrada. Cadastre no perfil.' })

    const ok = verifyAssertion(
      stored,
      response.clientDataJSON,
      response.authenticatorData,
      response.signature,
    )

    if (!ok) return res.status(401).json({ error: 'Falha na verificação biometrica' })

    getDb()
      .prepare('UPDATE webauthn_credentials SET sign_count = sign_count + 1 WHERE id = ?')
      .run(stored.id)

    const dbUser = getDb()
      .prepare('SELECT id, username, email, role FROM users WHERE id = ? AND active = 1')
      .get(stored.user_id)

    if (!dbUser) return res.status(401).json({ error: 'Usuario inativo ou não encontrado' })

    const token = generateToken(dbUser)
    res.json({ token, user: dbUser })
  } catch (e) {
    console.error('WebAuthn discover error:', e)
    res.status(401).json({ error: 'Falha na autenticação' })
  }
})

router.delete('/:userId', (req, res) => {
  getDb()
    .prepare('DELETE FROM webauthn_credentials WHERE user_id = ?')
    .run(req.params.userId)

  res.json({ success: true })
})

export default router
