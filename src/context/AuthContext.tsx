import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { uploadAvatar } from '../lib/avatarUpload'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Profile, ProfileUpdates } from '../types/database'
import { normalizeSocialLinks, parseSocialLinks } from '../lib/profile'

type AuthContextValue = {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  updateProfile: (updates: ProfileUpdates) => Promise<{ error: string | null }>
  uploadProfilePhoto: (file: File) => Promise<{
    url: string | null
    error: string | null
  }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return null
  return {
    ...data,
    description: data.description ?? null,
    social_links: parseSocialLinks(data.social_links),
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    const nextProfile = await fetchProfile(userId)
    setProfile(nextProfile)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session?.user) {
        void loadProfile(data.session.user.id)
      }
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        void loadProfile(nextSession.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      if (!supabase) return { error: 'Supabase is not configured' }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
        },
      })

      return { error: error?.message ?? null }
    },
    [],
  )

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase is not configured' }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }, [])

  const signInWithMagicLink = useCallback(async (email: string) => {
    if (!supabase) return { error: 'Supabase is not configured' }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })

    return { error: error?.message ?? null }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return { error: 'Supabase is not configured' }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })

    return { error: error?.message ?? null }
  }, [])

  const uploadProfilePhoto = useCallback(
    async (file: File) => {
      if (!session?.user) {
        return { url: null, error: 'You must be signed in' }
      }
      return uploadAvatar(session.user.id, file)
    },
    [session?.user],
  )

  const updateProfile = useCallback(
    async (updates: ProfileUpdates) => {
      if (!supabase || !session?.user) {
        return { error: 'Supabase is not configured' }
      }

      const { error } = await supabase.from('profiles').upsert(
        {
          id: session.user.id,
          display_name: updates.display_name.trim() || 'User',
          avatar_url: updates.avatar_url?.trim() || null,
          description: updates.description?.trim() || null,
          social_links: normalizeSocialLinks(updates.social_links),
        },
        { onConflict: 'id' },
      )

      if (error) {
        return { error: error.message }
      }

      await loadProfile(session.user.id)
      return { error: null }
    },
    [loadProfile, session?.user],
  )

  const signOut = useCallback(async () => {
    if (!supabase) return

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()

    if (currentUser) {
      await supabase
        .from('user_locations')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', currentUser.id)
    }

    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      signUp,
      signIn,
      signInWithMagicLink,
      signInWithGoogle,
      signOut,
      updateProfile,
      uploadProfilePhoto,
    }),
    [
      loading,
      session,
      profile,
      signUp,
      signIn,
      signInWithMagicLink,
      signInWithGoogle,
      signOut,
      updateProfile,
      uploadProfilePhoto,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
