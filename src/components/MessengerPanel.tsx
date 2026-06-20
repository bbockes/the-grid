import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatMessageTime } from '../hooks/useMessaging'
import type { ConversationPreview, Message } from '../types/database'
import './MessengerPanel.css'

type MessengerPanelProps = {
  open: boolean
  view: 'list' | 'thread'
  conversations: ConversationPreview[]
  activeConversation: ConversationPreview | null
  messages: Message[]
  currentUserId: string
  loading: boolean
  sending: boolean
  error: string | null
  onClose: () => void
  onBack: () => void
  onSelectConversation: (conversationId: string) => void
  onSendMessage: (body: string) => Promise<void>
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 6l-6 6 6 6"
      />
    </svg>
  )
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        d="M7 7l10 10M17 7 7 17"
      />
    </svg>
  )
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
      <path
        fill="currentColor"
        d="M3.4 20.4 22 12 3.4 3.6l2.8 7.2L16 12l-9.8 1.2-2.8 7.2Z"
      />
    </svg>
  )
}

function Avatar({
  name,
  avatarUrl,
  size = 40,
}: {
  name: string
  avatarUrl: string | null
  size?: number
}) {
  const initial = name.charAt(0).toUpperCase()

  if (avatarUrl) {
    return (
      <img
        className="messenger-avatar"
        style={{ width: size, height: size }}
        src={avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <span
      className="messenger-avatar messenger-avatar--initial"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  )
}

export default function MessengerPanel({
  open,
  view,
  conversations,
  activeConversation,
  messages,
  currentUserId,
  loading,
  sending,
  error,
  onClose,
  onBack,
  onSelectConversation,
  onSendMessage,
}: MessengerPanelProps) {
  const [draft, setDraft] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  const canSend = draft.trim().length > 0 && !sending

  useEffect(() => {
    if (view !== 'thread' || !threadRef.current) return
    threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [messages, view])

  useEffect(() => {
    if (view === 'list') setDraft('')
  }, [view])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSend) return
    const next = draft
    setDraft('')
    await onSendMessage(next)
  }

  if (!open) return null

  const threadTitle = activeConversation?.otherUser.display_name ?? 'Conversation'

  return (
    <aside className="messenger-panel" aria-label="Messages">
      <header className="messenger-panel__header">
        {view === 'thread' ? (
          <button
            type="button"
            className="messenger-panel__icon-button"
            aria-label="Back to conversations"
            onClick={onBack}
          >
            <IconBack />
          </button>
        ) : (
          <span className="messenger-panel__spacer" aria-hidden />
        )}

        {view === 'thread' && activeConversation ? (
          <div className="messenger-panel__thread-title">
            <Avatar
              name={activeConversation.otherUser.display_name}
              avatarUrl={activeConversation.otherUser.avatar_url}
              size={32}
            />
            <h2 className="messenger-panel__title">{threadTitle}</h2>
          </div>
        ) : (
          <h2 className="messenger-panel__title">Messages</h2>
        )}

        <button
          type="button"
          className="messenger-panel__icon-button"
          aria-label="Close messages"
          onClick={onClose}
        >
          <IconClose />
        </button>
      </header>

      {view === 'list' ? (
        <div className="messenger-panel__list">
          {loading && conversations.length === 0 && (
            <p className="messenger-panel__empty">Loading conversations…</p>
          )}

          {!loading && conversations.length === 0 && (
            <div className="messenger-panel__empty-state">
              <div className="messenger-panel__empty-icon" aria-hidden>
                <svg viewBox="0 0 24 24" width={28} height={28}>
                  <path
                    fill="currentColor"
                    d="M12 3C7.03 3 3 6.58 3 11c0 2.01.9 3.86 2.41 5.29L4 21l4.96-1.18A9.8 9.8 0 0 0 12 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z"
                  />
                </svg>
              </div>
              <p className="messenger-panel__empty-title">No messages yet</p>
              <p className="messenger-panel__empty">
                Click someone on the grid and choose Message to start chatting.
              </p>
            </div>
          )}

          {conversations.map((conversation) => {
            const preview = conversation.lastMessage?.body ?? 'Start a conversation'
            const previewPrefix =
              conversation.lastMessage?.sender_id === currentUserId
                ? 'You: '
                : ''

            return (
              <button
                key={conversation.id}
                type="button"
                className="messenger-conversation"
                onClick={() => onSelectConversation(conversation.id)}
              >
                <Avatar
                  name={conversation.otherUser.display_name}
                  avatarUrl={conversation.otherUser.avatar_url}
                />
                <span className="messenger-conversation__content">
                  <span className="messenger-conversation__row">
                    <span className="messenger-conversation__name">
                      {conversation.otherUser.display_name}
                    </span>
                    {conversation.lastMessage && (
                      <span className="messenger-conversation__time">
                        {formatMessageTime(conversation.lastMessage.created_at)}
                      </span>
                    )}
                  </span>
                  <span className="messenger-conversation__preview">
                    {previewPrefix}
                    {preview}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <>
          <div ref={threadRef} className="messenger-panel__thread">
            {messages.length === 0 && (
              <div className="messenger-panel__thread-empty">
                <Avatar
                  name={threadTitle}
                  avatarUrl={activeConversation?.otherUser.avatar_url ?? null}
                  size={56}
                />
                <p className="messenger-panel__empty-title">{threadTitle}</p>
                <p className="messenger-panel__empty messenger-panel__empty--thread">
                  Say hello to start the conversation.
                </p>
              </div>
            )}

            {messages.map((message, index) => {
              const isMine = message.sender_id === currentUserId
              const prev = messages[index - 1]
              const next = messages[index + 1]
              const groupedWithPrev =
                prev && prev.sender_id === message.sender_id
              const groupedWithNext =
                next && next.sender_id === message.sender_id

              return (
                <div
                  key={message.id}
                  className={[
                    'messenger-bubble-row',
                    isMine && 'messenger-bubble-row--mine',
                    groupedWithPrev && 'messenger-bubble-row--grouped-prev',
                    groupedWithNext && 'messenger-bubble-row--grouped-next',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div
                    className={[
                      'messenger-bubble',
                      isMine && 'messenger-bubble--mine',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {message.body}
                  </div>
                </div>
              )
            })}
          </div>

          <form className="messenger-panel__composer" onSubmit={onSubmit}>
            <div className="messenger-panel__composer-field">
              <input
                className="messenger-panel__input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message…"
                disabled={sending}
                aria-label="Message"
              />
              <button
                type="submit"
                className={`messenger-panel__send${canSend ? ' messenger-panel__send--ready' : ''}`}
                disabled={!canSend}
                aria-label="Send message"
              >
                <IconSend />
              </button>
            </div>
          </form>
        </>
      )}

      {error && <p className="messenger-panel__error">{error}</p>}
    </aside>
  )
}
