import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { initDb } from './database.js'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import documentRoutes from './routes/documents.js'
import categoryRoutes from './routes/categories.js'
import formatRoutes from './routes/formats.js'
import webauthnRoutes from './routes/webauthn.js'
import groupRoutes from './routes/groups.js'
import publicRoutes from './routes/public.js'

const app = express()
const PORT = process.env.API_PORT || 3001

app.set('trust proxy', 1)

app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  trustProxy: true,
  message: { error: 'Muitas requisicoes. Tente novamente mais tarde.' },
})
app.use('/api', globalLimiter)

initDb()

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/formats', formatRoutes)
app.use('/api/webauthn', webauthnRoutes)
app.use('/api/groups', groupRoutes)
app.use('/api/public', publicRoutes)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'repositorio-aprendeti-api' })
})

app.use((err, _req, res, _next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Erro interno do servidor' })
})

app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`)
})
