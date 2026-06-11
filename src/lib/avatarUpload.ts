import { supabase } from './supabase'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<{ url: string | null; error: string | null }> {
  if (!supabase) {
    return { url: null, error: 'Supabase is not configured' }
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return { url: null, error: 'Please choose a JPG, PNG, WebP, or GIF image' }
  }

  if (file.size > MAX_BYTES) {
    return { url: null, error: 'Image must be under 5 MB' }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg'
  const path = `${userId}/avatar.${safeExt}`

  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    upsert: true,
    contentType: file.type,
  })

  if (error) {
    const message =
      error.message === 'Bucket not found'
        ? 'Photo storage is not set up. Run supabase/migrations/004_avatar_storage.sql in the Supabase SQL Editor, then try again.'
        : error.message
    return { url: null, error: message }
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return { url: `${data.publicUrl}?t=${Date.now()}`, error: null }
}
