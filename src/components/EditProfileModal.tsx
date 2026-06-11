import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  MAX_DESCRIPTION_WORDS,
  MAX_SOCIAL_LINKS,
  countWords,
  normalizeSocialLinks,
} from '../lib/profile'
import type { Profile, ProfileUpdates } from '../types/database'
import './EditProfileModal.css'

function linksFromProfile(profile: Profile | null) {
  const links = [...(profile?.social_links ?? [])]
  while (links.length < MAX_SOCIAL_LINKS) links.push('')
  return links.slice(0, MAX_SOCIAL_LINKS)
}

type EditProfileModalProps = {
  profile: Profile | null
  fallbackName: string
  fallbackAvatarUrl: string | null
  onClose: () => void
  onSave: (updates: ProfileUpdates) => Promise<{ error: string | null }>
  onUploadPhoto: (file: File) => Promise<{
    url: string | null
    error: string | null
  }>
}

export default function EditProfileModal({
  profile,
  fallbackName,
  fallbackAvatarUrl,
  onClose,
  onSave,
  onUploadPhoto,
}: EditProfileModalProps) {
  const [name, setName] = useState(profile?.display_name ?? fallbackName)
  const [description, setDescription] = useState(profile?.description ?? '')
  const [socialLinks, setSocialLinks] = useState(linksFromProfile(profile))
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    profile?.avatar_url ?? fallbackAvatarUrl,
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const objectUrlRef = useRef<string | null>(null)

  const wordCount = countWords(description)

  useEffect(() => {
    setName(profile?.display_name ?? fallbackName)
    setDescription(profile?.description ?? '')
    setSocialLinks(linksFromProfile(profile))
    setSelectedFile(null)
    setPreviewUrl(profile?.avatar_url ?? fallbackAvatarUrl)
  }, [profile, fallbackName, fallbackAvatarUrl])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
    }
  }, [])

  const onFileChange = (file: File | undefined) => {
    if (!file) return

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
    }

    const objectUrl = URL.createObjectURL(file)
    objectUrlRef.current = objectUrl
    setSelectedFile(file)
    setPreviewUrl(objectUrl)
    setError(null)
  }

  const updateLink = (index: number, value: string) => {
    setSocialLinks((current) => {
      const next = [...current]
      next[index] = value
      return next
    })
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (wordCount > MAX_DESCRIPTION_WORDS) {
      setError(`Description must be ${MAX_DESCRIPTION_WORDS} words or fewer`)
      return
    }

    const normalizedLinks = normalizeSocialLinks(socialLinks)
    const invalidLink = socialLinks.find(
      (link) => link.trim() && !normalizeSocialLinks([link]).length,
    )
    if (invalidLink) {
      setError(`"${invalidLink}" is not a valid URL`)
      return
    }

    setSaving(true)

    try {
      let avatarUrl = profile?.avatar_url ?? fallbackAvatarUrl

      if (selectedFile) {
        const upload = await onUploadPhoto(selectedFile)
        if (upload.error || !upload.url) {
          setError(upload.error ?? 'Upload failed')
          return
        }
        avatarUrl = upload.url
      }

      const result = await onSave({
        display_name: name,
        avatar_url: avatarUrl,
        description: description.trim() || null,
        social_links: normalizedLinks,
      })

      if (result.error) {
        setError(result.error)
      } else {
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  const previewInitial = (name || 'U').charAt(0).toUpperCase()

  return (
    <div className="edit-profile-overlay" onClick={onClose}>
      <div
        className="edit-profile-modal"
        role="dialog"
        aria-labelledby="edit-profile-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="edit-profile-modal__header">
          <h2 id="edit-profile-title" className="edit-profile-modal__title">
            Edit profile
          </h2>
          <button
            type="button"
            className="edit-profile-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <form className="edit-profile-modal__form" onSubmit={onSubmit}>
          <div className="edit-profile-modal__body">
            <section className="edit-profile-section">
              <h3 className="edit-profile-section__title">Profile picture</h3>
              <div className="edit-profile-photo">
                {previewUrl ? (
                  <img
                    className="edit-profile-photo__avatar"
                    src={previewUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="edit-profile-photo__avatar edit-profile-photo__avatar--initial">
                    {previewInitial}
                  </span>
                )}

                <div className="edit-profile-photo__actions">
                  <p className="edit-profile-photo__lead">
                    Add a photo so people can recognize you on the grid.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="edit-profile-modal__file-input"
                    onChange={(e) => onFileChange(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    className="edit-profile-photo__button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Add photo
                  </button>
                  <p className="edit-profile-photo__hint">
                    {selectedFile
                      ? selectedFile.name
                      : 'JPG, PNG, WebP, or GIF · max 5 MB'}
                  </p>
                </div>
              </div>
            </section>

            <hr className="edit-profile-divider" />

            <section className="edit-profile-section">
              <h3 className="edit-profile-section__title">About you</h3>
              <div className="edit-profile-fields">
                <label className="edit-profile-field">
                  <span className="edit-profile-field__label">Display name</span>
                  <input
                    className="edit-profile-field__input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required
                  />
                </label>

                <label className="edit-profile-field">
                  <span className="edit-profile-field__label">Description</span>
                  <textarea
                    className="edit-profile-field__textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Write a few sentences about yourself…"
                    rows={5}
                  />
                  <span
                    className={`edit-profile-field__meta${
                      wordCount > MAX_DESCRIPTION_WORDS
                        ? ' edit-profile-field__meta--error'
                        : ''
                    }`}
                  >
                    {wordCount} / {MAX_DESCRIPTION_WORDS} words
                  </span>
                </label>
              </div>
            </section>

            <hr className="edit-profile-divider" />

            <section className="edit-profile-section">
              <h3 className="edit-profile-section__title">Social links</h3>
              <p className="edit-profile-section__subtitle">
                Add up to {MAX_SOCIAL_LINKS} links to your profiles and websites.
              </p>
              <div className="edit-profile-links">
                {socialLinks.map((link, index) => (
                  <label key={index} className="edit-profile-field">
                    <span className="edit-profile-field__label">
                      Link {index + 1}
                    </span>
                    <input
                      className="edit-profile-field__input"
                      type="url"
                      value={link}
                      onChange={(e) => updateLink(index, e.target.value)}
                      placeholder="https://instagram.com/you"
                    />
                  </label>
                ))}
              </div>
            </section>

            {error && <p className="edit-profile-modal__error">{error}</p>}
          </div>

          <footer className="edit-profile-modal__footer">
            <button
              type="button"
              className="edit-profile-modal__button edit-profile-modal__button--secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="edit-profile-modal__button edit-profile-modal__button--primary"
              disabled={saving || wordCount > MAX_DESCRIPTION_WORDS}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
