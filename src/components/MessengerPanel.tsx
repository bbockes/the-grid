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

  useEffect(() => {
    if (view !== 'thread' || !threadRef.current) return
    threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [messages, view])

  useEffect(() => {
    if (view === 'list') setDraft('')
  }, [view])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim() || sending) return
    const next = draft
    setDraft('')
    await onSendMessage(next)
  }

  if (!open) return null

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
            ←
          </button>
        ) : (
          <span className="messenger-panel__spacer" />
        )}

        <h2 className="messenger-panel__title">
          {view === 'thread'
            ? (activeConversation?.otherUser.display_name ?? 'Conversation')
            : 'Messages'}
        </h2>

        <button
          type="button"
          className="messenger-panel__icon-button"
          aria-label="Close messages"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      {view === 'list' ? (
        <div className="messenger-panel__list">
          {loading && conversations.length === 0 && (
            <p className="messenger-panel__empty">Loading conversations…</p>
          )}

          {!loading && conversations.length === 0 && (
            <p className="messenger-panel__empty">
              No conversations yet. Click someone on the grid and choose Message to
              start chatting.
            </p>
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
              <p className="messenger-panel__empty messenger-panel__empty--thread">
                Say hello to {activeConversation?.otherUser.display_name ?? 'them'}.
              </p>
            )}

            {messages.map((message) => {
              const isMine = message.sender_id === currentUserId
              return (
                <div
                  key={message.id}
                  className={`messenger-bubble-row${
                    isMine ? ' messenger-bubble-row--mine' : ''
                  }`}
                >
                  <div
                    className={`messenger-bubble${
                      isMine ? ' messenger-bubble--mine' : ''
                    }`}
                  >
                    {message.body}
                  </div>
                </div>
              )
            })}
          </div>

          <form className="messenger-panel__composer" onSubmit={onSubmit}>
            <input
              className="messenger-panel__input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Aa"
              disabled={sending}
            />
            <button
              type="submit"
              className="messenger-panel__send"
              disabled={sending || !draft.trim()}
            >
              Send
            </button>
          </form>
        </>
      )}

      {error && <p className="messenger-panel__error">{error}</p>}
    </aside>
  )
}
