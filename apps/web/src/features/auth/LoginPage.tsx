import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Dialog, ErrorState, Input, LoadingState } from '../../components'
import { roles } from '../../app/roles'
import { AuthError, roleKey, useAuth } from './auth'
import base from './login-base.png'
import logo from './login-logo.png'
import scene from './login-scene.png'
import userIcon from './login-user.svg'
import lockIcon from './login-lock.svg'
import eyeIcon from './login-eye.svg'
import checkIcon from './login-check.svg'
import arrowIcon from './login-arrow.svg'
import './auth.css'

const DEMO_ROLES = [
  {
    role: 'Dispatcher',
    tag: 'DSP',
    username: (import.meta.env.VITE_SEED_DISPATCHER_USERNAME || import.meta.env.SEED_DISPATCHER_USERNAME || 'DSP-001') as string,
    password: (import.meta.env.VITE_SEED_DISPATCHER_PASSWORD || import.meta.env.SEED_DISPATCHER_PASSWORD || 'Dispatcher12') as string,
  },
  {
    role: 'Store Manager',
    tag: 'STM',
    username: (import.meta.env.VITE_SEED_STORE_MANAGER_USERNAME || import.meta.env.SEED_STORE_MANAGER_USERNAME || 'STM-001') as string,
    password: (import.meta.env.VITE_SEED_STORE_MANAGER_PASSWORD || import.meta.env.SEED_STORE_MANAGER_PASSWORD || 'StoreManager12') as string,
  },
  {
    role: 'Loader',
    tag: 'LDR',
    username: (import.meta.env.VITE_SEED_LOADER_USERNAME || import.meta.env.SEED_LOADER_USERNAME || 'LDR-001') as string,
    password: (import.meta.env.VITE_SEED_LOADER_PASSWORD || import.meta.env.SEED_LOADER_PASSWORD || 'LoaderPass12') as string,
  },
  {
    role: 'Driver',
    tag: 'DRV',
    username: (import.meta.env.VITE_SEED_DRIVER_USERNAME || import.meta.env.SEED_DRIVER_USERNAME || 'DRV-001') as string,
    password: (import.meta.env.VITE_SEED_DRIVER_PASSWORD || import.meta.env.SEED_DRIVER_PASSWORD || 'DriverPass12') as string,
  },
] as const

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [help, setHelp] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)

  function fillCredentials(u: string, p: string) {
    setUsername(u)
    setPassword(p)
    setError(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const user = await auth.login(username.trim(), password, rememberMe)
      setPassword('')
      navigate(roles[roleKey(user.role)].basePath, { replace: true })
    } catch (failure) {
      setPassword('')
      setError(failure instanceof AuthError ? failure : new AuthError('Could not reach the API. Try again.'))
    } finally { setPending(false) }
  }

  if (auth.loading) return <main className="auth-state"><LoadingState label="Restoring session" /></main>
  if (auth.error) return <main className="auth-state"><ErrorState message={auth.error.message} onRetry={auth.retry} /></main>
  if (auth.user) return <Navigate to={roles[roleKey(auth.user.role)].basePath} replace />

  return (
    <main className="auth-page">
      <div className="auth-art" aria-hidden="true">
        <img className="auth-base" src={base} alt="" />
        <div className="auth-scrim" />
        <img className="auth-logo" src={logo} alt="" />
        <img className="auth-scene" src={scene} alt="" />
      </div>
      <section className="auth-content" aria-labelledby="login-title">
        <p className="text-auth-overline auth-welcome">WELCOME BACK</p>
        <h1 id="login-title" className="text-auth-heading">Waypoint Login</h1>
        <p className="text-body-s auth-intro">Sign in to continue to<br />Waypoint Operations</p>
        <div className="auth-quick-fill" aria-label="Demo role quick fill">
          <span className="auth-quick-title">Quick Demo Login</span>
          <div className="auth-quick-buttons">
            {DEMO_ROLES.map((r) => {
              const isSelected = username === r.username
              return (
                <button
                  key={r.tag}
                  type="button"
                  className={`auth-quick-btn${isSelected ? ' auth-quick-btn-active' : ''}`}
                  onClick={() => fillCredentials(r.username, r.password)}
                  disabled={pending}
                  title={`Fill ${r.role} (${r.username}) credentials`}
                  aria-pressed={isSelected}
                >
                  <span className="auth-quick-tag">{r.tag}</span>
                  <span className="auth-quick-name">{r.role}</span>
                </button>
              )
            })}
          </div>
        </div>
        <form onSubmit={submit} className="auth-form">
          <div className="auth-field">
            <span className="auth-field-icon"><img src={userIcon} alt="" /></span>
            <Input label="USER ID" name="username" autoComplete="username" maxLength={64} required value={username} onChange={(e) => setUsername(e.target.value)} disabled={pending} />
          </div>
          <div className="auth-field">
            <span className="auth-field-icon"><img src={lockIcon} alt="" /></span>
            <Input label="PASSWORD" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" maxLength={72} required value={password} onChange={(e) => setPassword(e.target.value)} disabled={pending} />
            <button type="button" className="auth-eye" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}><img src={eyeIcon} alt="" /></button>
          </div>
          <div className="auth-options">
            <label className="auth-remember text-caption-medium">
              <span className="auth-checkbox"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} disabled={pending} /><img src={checkIcon} alt="" /></span>
              Remember me
            </label>
            <button type="button" className="auth-help text-caption-medium" onClick={() => setHelp(true)}>Forgot password?</button>
          </div>
          {error && <div className="auth-error" role="alert"><p>{error.message}</p>{error.retryAfter && <p>Try again in {error.retryAfter} seconds.</p>}{error.traceId && <small>Trace id: {error.traceId}</small>}</div>}
          <Button type="submit" size="lg" className="auth-submit" loading={pending}>{pending ? 'Signing in…' : 'Sign In'}<img src={arrowIcon} alt="" /></Button>
        </form>
      </section>
      <footer className="auth-footer text-caption">Waypoint Operations</footer>
      <Dialog open={help} title="Sign-in help" onClose={() => setHelp(false)}><p>Contact your administrator for account or password help. Self-service password reset is not available.</p></Dialog>
    </main>
  )
}
