import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'

const IDLE_TIMEOUT = 30 * 60 * 1000
const WARNING_DURATION = 30

export default function SessionTimeout() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [showWarning, setShowWarning] = useState(false)
  const [countdown, setCountdown] = useState(WARNING_DURATION)
  const lastActivity = useRef(Date.now())
  const countdownRef = useRef(null)
  const timeoutRef = useRef(null)

  const resetTimer = useCallback(() => {
    lastActivity.current = Date.now()
    setShowWarning(false)
    setCountdown(WARNING_DURATION)
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(() => {
      setShowWarning(true)
      let sec = WARNING_DURATION
      countdownRef.current = setInterval(() => {
        sec--
        setCountdown(sec)
        if (sec <= 0) {
          clearInterval(countdownRef.current)
          logout()
          navigate('/login')
        }
      }, 1000)
    }, IDLE_TIMEOUT)
  }, [logout, navigate])

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    const handler = () => resetTimer()

    events.forEach((e) => document.addEventListener(e, handler, { passive: true }))
    resetTimer()

    return () => {
      events.forEach((e) => document.removeEventListener(e, handler))
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [resetTimer])

  if (!showWarning) return null

  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal" style={{ maxWidth: 420, textAlign: 'center' }}>
        <AlertTriangle size={40} style={{ color: '#eab308', marginBottom: 16 }} />
        <h2 style={{ marginBottom: 8 }}>Sessao inativa</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '.875rem', marginBottom: 20 }}>
          Você está inativo ha 30 minutos. Sua sessão será encerrada em{' '}
          <strong style={{ color: 'var(--danger)' }}>{countdown}s</strong>.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={resetTimer}>
            Permanecer conectado
          </button>
        </div>
      </div>
    </div>
  )
}
