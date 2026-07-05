import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { rateLimit } from 'express-rate-limit'
import { getDb } from '../database.js'
import { generateToken, authMiddleware } from '../middleware/auth.js'

const router = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
  keyGenerator: (req) => req.ip,
})

const ipBlockLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'IP bloqueado temporariamente por excesso de tentativas.' },
  keyGenerator: (req) => req.ip,
})

function recordAttempt(ip, username, success) {
  getDb()
    .prepare('INSERT INTO login_attempts (ip, username, success) VALUES (?, ?, ?)')
    .run(ip, username || null, success ? 1 : 0)
}

router.post('/login', ipBlockLimiter, loginLimiter, (req, res) => {
  const { username, password } = req.body
  const ip = req.ip

  if (!username || !password) {
    recordAttempt(ip, username, false)
    return res.status(400).json({ error: 'Usuario e senha obrigatórios' })
  }

  const user = getDb()
    .prepare('SELECT * FROM users WHERE username = ? AND active = 1')
    .get(username)

  if (!user || !bcrypt.compareSync(password, user.password)) {
    recordAttempt(ip, username, false)
    return res.status(401).json({ error: 'Credenciais inválidas' })
  }

  recordAttempt(ip, username, true)

  const token = generateToken(user)
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  })
})

router.get('/me', authMiddleware, (req, res) => {
  const user = getDb()
    .prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?')
    .get(req.user.id)

  if (!user) return res.status(404).json({ error: 'Usuario não encontrado' })
  res.json(user)
})

router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: ' Senha atual e nova senha obrigatórias' })
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Nova senha deve ter no mínimo 6 caracteres' })
  }

  const user = getDb()
    .prepare('SELECT * FROM users WHERE id = ?')
    .get(req.user.id)

  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Senha atual incorreta' })
  }

  const hash = bcrypt.hashSync(newPassword, 12)
  getDb()
    .prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(hash, req.user.id)

  res.json({ message: 'Senha alterada com sucesso' })
})

export default router
