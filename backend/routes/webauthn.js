import { Router } from 'express'
import { getDb } from '../database.js'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { generateToken } from '../middleware/auth.js'

const router = Router()

const RP_NAME = 'AprendeTI'
const RP_ID = process.env.WEBAUTHN_RP_ID || 'aprendeti.uman-app.uk'
const ORIGIN = process.env.WEBAUTHN_ORIGIN || `https://${RP_ID}`

const CHALLENGE_TTL_MS = 5 * 60 * 1000
const challengeStore = new Map()

function saveChallenge(key, challenge) {
  challengeStore.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS })
  setTimeout(() => challengeStore.delete(key), CHALLENGE_TTL_MS)
}

function takeChallenge(key) {
  const entry = challengeStore.get(key)
  if (!entry) return null
  challengeStore.delete(key)
  if (Date.now() > entry.expiresAt) return null
  return entry.challenge
}

function b64(buf) {
  return Buffer.from(buf).toString('base64url')
}

function ub64(str) {
  return new Uint8Array(Buffer.from(str, 'base64url'))
}

function getUserCredentials(userId) {
  return getDb()
    .prepare('SELECT id, credential_id, public_key_pem, sign_count, device_name, transports FROM webauthn_credentials WHERE user_id = ?')
    .all(userId)
}

function credentialToJSON(cred) {
  return {
    id: cred.credential_id,
    type: 'public-key',
    transports: cred.transports ? JSON.parse(cred.transports) : undefined,
  }
}

function credentialToAuth(cred) {
  return {
    id: cred.credential_id,
    publicKey: ub64(cred.public_key_pem),
    counter: cred.sign_count,
    transports: cred.transports ? JSON.parse(cred.transports) : undefined,
  }
}

function nextDeviceLabel(userId) {
  const taken = getDb()
    .prepare('SELECT device_name FROM webauthn_credentials WHERE user_id = ?')
    .all(userId)
    .map((c) => c.device_name)

  return `Dispositivo de Acesso ${taken.length + 1}`
}

router.post('/register/options', async (req, res) => {
  const { userId, username } = req.body
  if (!userId || !username) return res.status(400).json({ error: 'userId e username obrigatórios' })

  const existing = getUserCredentials(userId)

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(String(userId)),
    userName: username,
    userDisplayName: username,
    attestationType: 'none',
    authenticatorSelection: {
      userVerification: 'required',
      residentKey: 'required',
      requireResidentKey: true,
    },
    excludeCredentials: existing.map((c) => credentialToJSON(c)),
  })

  const challengeB64 = b64(options.challenge)
  const sessionId = `reg:${userId}:${crypto.randomUUID()}`
  saveChallenge(sessionId, challengeB64)

  res.json({ options: { ...options, challenge: challengeB64 }, sessionId, label: nextDeviceLabel(userId) })
})

router.post('/register', async (req, res) => {
  const { userId, credential, deviceName, sessionId } = req.body
  if (!userId || !credential || !sessionId) {
    return res.status(400).json({ error: `Dados obrigatorios ausentes. userId:${!!userId}, cred:${!!credential}, session:${!!sessionId}` })
  }

  const expectedChallenge = takeChallenge(sessionId)
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'Sessão de cadastro expirada. Tente novamente.' })
  }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      supportedCOSEAlgorithmIDs: [-7, -257],
    })
  } catch (e) {
    return res.status(400).json({ error: 'Falha na verificação do registro: ' + e.message })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: 'Registro não verificado' })
  }

  const { credential } = verification.registrationInfo
  const credIdB64 = credential.id
  const pubKeyB64 = b64(credential.publicKey)
  const counter = credential.counter
  const transports = credential.transports

  getDb()
    .prepare('INSERT OR REPLACE INTO webauthn_credentials (user_id, credential_id, public_key_pem, sign_count, device_name, transports) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, credIdB64, pubKeyB64, counter, deviceName || 'Biometria', JSON.stringify(transports || []))

  res.json({ success: true, credentialId: credIdB64 })
})

router.post('/login/options', async (req, res) => {
  const { username } = req.body

  const user = getDb()
    .prepare('SELECT id FROM users WHERE username = ? AND active = 1')
    .get(username)

  if (!user) return res.status(404).json({ error: 'Usuario não encontrado' })

  const rawCredentials = getUserCredentials(user.id)

  if (rawCredentials.length === 0) {
    return res.status(404).json({ error: 'Nenhuma biometria cadastrada' })
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: rawCredentials.map((c) => credentialToJSON(c)),
    userVerification: 'required',
  })

  const challengeB64 = b64(options.challenge)
  const sessionId = `login:${user.id}:${crypto.randomUUID()}`
  saveChallenge(sessionId, challengeB64)

  res.json({ options: { ...options, challenge: challengeB64 }, sessionId })
})

router.post('/login', async (req, res) => {
  const { username, credential, sessionId } = req.body
  if (!username || !credential || !sessionId) {
    return res.status(400).json({ error: `[Login] Dados ausentes. usr:${!!username}, cred:${!!credential}, sess:${!!sessionId}` })
  }

  const user = getDb()
    .prepare('SELECT id FROM users WHERE username = ? AND active = 1')
    .get(username)
  if (!user) return res.status(404).json({ error: 'Usuario não encontrado' })

  const stored = getDb()
    .prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ?')
    .get(credential.id)
  if (!stored || stored.user_id !== user.id) {
    return res.status(401).json({ error: 'Credencial não corresponde ao usuario' })
  }

  const expectedChallenge = takeChallenge(sessionId)
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'Sessão expirada. Tente novamente.' })
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: credentialToAuth(stored),
      requireUserVerification: true,
    })

    if (!verification.verified) {
      return res.status(401).json({ error: 'Falha na verificação biometrica' })
    }

    getDb()
      .prepare('UPDATE webauthn_credentials SET sign_count = ? WHERE id = ?')
      .run(verification.authenticationInfo.newCounter, stored.id)

    const dbUser = getDb()
      .prepare('SELECT id, username, email, role FROM users WHERE id = ?')
      .get(stored.user_id)

    const token = generateToken(dbUser)
    res.json({ token, user: dbUser })
  } catch (e) {
    res.status(401).json({ error: 'Falha na autenticação biometrica: ' + e.message })
  }
})

router.post('/login-discover-options', async (_req, res) => {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
  })

  const challengeB64 = b64(options.challenge)
  const sessionId = `discover:${crypto.randomUUID()}`
  saveChallenge(sessionId, challengeB64)

  res.json({ options: { ...options, challenge: challengeB64 }, sessionId })
})

router.post('/login-discover', async (req, res) => {
  const { credential, sessionId } = req.body
  if (!credential || !sessionId) return res.status(400).json({ error: `[Discover] Dados ausentes. cred:${!!credential}, sess:${!!sessionId}` })

  const stored = getDb()
    .prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ?')
    .get(credential.id)
  if (!stored) {
    return res.status(400).json({ error: 'Credencial biometrica não encontrada. Cadastre no perfil.' })
  }

  const expectedChallenge = takeChallenge(sessionId)
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'Sessão expirada. Tente novamente.' })
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: credentialToAuth(stored),
      requireUserVerification: true,
    })

    if (!verification.verified) {
      return res.status(401).json({ error: 'Falha na verificação biometrica' })
    }

    getDb()
      .prepare('UPDATE webauthn_credentials SET sign_count = ? WHERE id = ?')
      .run(verification.authenticationInfo.newCounter, stored.id)

    const dbUser = getDb()
      .prepare('SELECT id, username, email, role FROM users WHERE id = ? AND active = 1')
      .get(stored.user_id)
    if (!dbUser) return res.status(401).json({ error: 'Usuario inativo ou não encontrado' })

    const token = generateToken(dbUser)
    res.json({ token, user: dbUser })
  } catch (e) {
    res.status(401).json({ error: 'Falha na autenticação' })
  }
})

router.post('/verify', async (req, res) => {
  const { credential, sessionId } = req.body
  if (!credential || !sessionId) return res.status(400).json({ error: `[Verify] Dados ausentes. cred:${!!credential}, sess:${!!sessionId}` })

  const stored = getDb()
    .prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ?')
    .get(credential.id)
  if (!stored) return res.status(400).json({ error: 'Credencial não encontrada' })

  const expectedChallenge = takeChallenge(sessionId)
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'Sessão expirada. Solicite um novo desafio.' })
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: credentialToAuth(stored),
      requireUserVerification: true,
    })

    if (!verification.verified) {
      return res.status(401).json({ error: 'Falha na verificação' })
    }

    getDb()
      .prepare('UPDATE webauthn_credentials SET sign_count = ? WHERE id = ?')
      .run(verification.authenticationInfo.newCounter, stored.id)

    res.json({ valid: true, counter: verification.authenticationInfo.newCounter })
  } catch (e) {
    res.status(401).json({ error: 'Falha na verificação' })
  }
})

router.get('/status/:userId', (req, res) => {
  const count = getDb()
    .prepare('SELECT COUNT(*) as c FROM webauthn_credentials WHERE user_id = ?')
    .get(req.params.userId)

  res.json({ registered: count.c > 0 })
})

router.get('/credentials/:userId', (req, res) => {
  const creds = getDb()
    .prepare('SELECT id, credential_id, device_name, sign_count, created_at FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at')
    .all(req.params.userId)

  res.json(creds)
})

router.delete('/credential/:id', (req, res) => {
  getDb().prepare('DELETE FROM webauthn_credentials WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

router.delete('/:userId', (req, res) => {
  getDb().prepare('DELETE FROM webauthn_credentials WHERE user_id = ?').run(req.params.userId)
  res.json({ success: true })
})

export default router