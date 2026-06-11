import type { UserBox } from '../types/database'
import './UserProfileModal.css'

type UserProfileModalProps = {
  box: UserBox
  onClose: () => void
}

function linkLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export default function UserProfileModal({ box, onClose }: UserProfileModalProps) {
  const initial = box.display_name.charAt(0).toUpperCase()
  const isAway = !box.is_active
  const description = box.description?.trim()
  const links = box.social_links.filter(Boolean)

  return (
    <div className="user-profile-overlay" onClick={onClose}>
      <div
        className="user-profile-modal"
        role="dialog"
        aria-labelledby="user-profile-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="user-profile-modal__header">
          <h2 id="user-profile-title" className="user-profile-modal__title">
            {box.display_name}
          </h2>
          <button
            type="button"
            className="user-profile-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="user-profile-modal__body">
          <div className="user-profile-modal__hero">
            {box.avatar_url ? (
              <img
                className="user-profile-modal__avatar"
                src={box.avatar_url}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="user-profile-modal__avatar user-profile-modal__avatar--initial">
                {initial}
              </div>
            )}

            <div className="user-profile-modal__identity">
              <p className="user-profile-modal__name">{box.display_name}</p>
              {isAway && (
                <span className="user-profile-modal__badge">Away</span>
              )}
            </div>
          </div>

          <section className="user-profile-section">
            <h3 className="user-profile-section__title">About</h3>
            <p className="user-profile-section__text">
              {description || 'No description yet.'}
            </p>
          </section>

          {links.length > 0 && (
            <section className="user-profile-section">
              <h3 className="user-profile-section__title">Links</h3>
              <ul className="user-profile-links">
                {links.map((url) => (
                  <li key={url}>
                    <a
                      className="user-profile-links__item"
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {linkLabel(url)}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
