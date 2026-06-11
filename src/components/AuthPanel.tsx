import { useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import EditProfileModal from './EditProfileModal'
import './AuthPanel.css'

function getAvatarUrl(
  profile: { avatar_url: string | null } | null,
  user: { user_metadata?: Record<string, unknown> },
) {
  const fromProfile = profile?.avatar_url
  if (typeof fromProfile === 'string' && fromProfile) return fromProfile

  const meta = user.user_metadata ?? {}
  const candidates = [meta.avatar_url, meta.picture, meta.avatarUrl]
  for (const value of candidates) {
    if (typeof value === 'string' && value) return value
  }

  return null
}

type Mode = 'signin' | 'signup' | 'magic'

export default function AuthPanel() {
  const {
    configured,
    loading,
    user,
    profile,
    signUp,
    signIn,
    signInWithMagicLink,
    signInWithGoogle,
    signOut,
    updateProfile,
    uploadProfilePhoto,
  } = useAuth()

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  if (loading) {
    return (
      <div className="auth-panel">
        <span className="auth-panel__status">Loading…</span>
      </div>
    )
  }

  if (!configured) {
    return (
      <div className="auth-panel auth-panel--setup">
        <p className="auth-panel__title">Supabase setup required</p>
        <p className="auth-panel__copy">
          Copy <code>.env.example</code> to <code>.env</code>, add your project
          URL and anon key, then run the SQL in{' '}
          <code>supabase/migrations/001_initial.sql</code>.
        </p>
      </div>
    )
  }

  if (user) {
    const displayName = profile?.display_name ?? user.email ?? 'User'
    const avatarUrl = getAvatarUrl(profile, user)
    const initial = displayName.charAt(0).toUpperCase()

    return (
      <div className="auth-avatar-menu" ref={menuRef}>
        <button
          type="button"
          className="auth-avatar"
          aria-label={`${displayName} account menu`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          onBlur={(e) => {
            if (!menuRef.current?.contains(e.relatedTarget as Node)) {
              setMenuOpen(false)
            }
          }}
        >
          {avatarUrl ? (
            <img
              className="auth-avatar__image"
              src={avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="auth-avatar__initial">{initial}</span>
          )}
        </button>

        {menuOpen && (
          <div className="auth-avatar-menu__dropdown">
            <p className="auth-avatar-menu__name">{displayName}</p>
            <button
              type="button"
              className="auth-avatar-menu__action"
              onClick={() => {
                setMenuOpen(false)
                setEditOpen(true)
              }}
            >
              Edit profile
            </button>
            <button
              type="button"
              className="auth-avatar-menu__signout"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        )}

        {editOpen && (
          <EditProfileModal
            profile={profile}
            fallbackName={displayName}
            fallbackAvatarUrl={avatarUrl}
            onClose={() => setEditOpen(false)}
            onSave={updateProfile}
            onUploadPhoto={uploadProfilePhoto}
          />
        )}
      </div>
    )
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setSubmitting(true)

    try {
      if (mode === 'signup') {
        const result = await signUp(email, password, displayName)
        if (result.error) {
          setError(result.error)
        } else {
          setMessage('Check your email to confirm your account.')
        }
      } else if (mode === 'signin') {
        const result = await signIn(email, password)
        if (result.error) setError(result.error)
      } else {
        const result = await signInWithMagicLink(email)
        if (result.error) {
          setError(result.error)
        } else {
          setMessage('Magic link sent — check your email.')
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const onGoogle = async () => {
    setError(null)
    const result = await signInWithGoogle()
    if (result.error) setError(result.error)
  }

  return (
    <div className="auth-panel">
      <div className="auth-panel__tabs">
        <button
          type="button"
          className={mode === 'signin' ? 'active' : ''}
          onClick={() => setMode('signin')}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === 'signup' ? 'active' : ''}
          onClick={() => setMode('signup')}
        >
          Sign up
        </button>
        <button
          type="button"
          className={mode === 'magic' ? 'active' : ''}
          onClick={() => setMode('magic')}
        >
          Magic link
        </button>
      </div>

      <form className="auth-panel__form" onSubmit={onSubmit}>
        {mode === 'signup' && (
          <label>
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name on the grid"
              required
            />
          </label>
        )}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>

        {mode !== 'magic' && (
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </label>
        )}

        {error && <p className="auth-panel__error">{error}</p>}
        {message && <p className="auth-panel__message">{message}</p>}

        <button
          type="submit"
          className="auth-panel__button auth-panel__button--primary"
          disabled={submitting}
        >
          {submitting
            ? 'Please wait…'
            : mode === 'signup'
              ? 'Create account'
              : mode === 'magic'
                ? 'Send magic link'
                : 'Sign in'}
        </button>
      </form>

      <div className="auth-panel__divider">
        <span>or</span>
      </div>

      <button
        type="button"
        className="auth-panel__button auth-panel__button--google"
        onClick={() => void onGoogle()}
      >
        Continue with Google
      </button>
    </div>
  )
}
