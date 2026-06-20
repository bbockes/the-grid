import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ConversationPreview, Message } from '../types/database'

function formatMessageTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export { formatMessageTime }

export function useMessaging(userId: string | undefined) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [view, setView] = useState<'list' | 'thread'>('list')
  const [conversations, setConversations] = useState<ConversationPreview[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  )
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeConversationIdRef = useRef<string | null>(null)

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  const loadConversations = useCallback(async () => {
    if (!supabase || !userId) {
      setConversations([])
      return
    }

    const client = supabase

    const { data: memberships, error: membershipError } = await client
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId)

    if (membershipError) {
      setError(membershipError.message)
      return
    }

    if (!memberships?.length) {
      setConversations([])
      return
    }

    const conversationIds = memberships.map((row) => row.conversation_id)
    const { data: conversationRows, error: conversationError } = await client
      .from('conversations')
      .select('id, updated_at')
      .in('id', conversationIds)
      .order('updated_at', { ascending: false })

    if (conversationError) {
      setError(conversationError.message)
      return
    }

    const previews = await Promise.all(
      (conversationRows ?? []).map(async (conversation) => {
        const { data: participants } = await client
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conversation.id)

        const otherUserId = participants?.find(
          (participant) => participant.user_id !== userId,
        )?.user_id

        if (!otherUserId) return null

        const { data: profile } = await client
          .from('profiles')
          .select('id, display_name, avatar_url')
          .eq('id', otherUserId)
          .maybeSingle()

        const { data: lastMessages } = await client
          .from('messages')
          .select('body, created_at, sender_id')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(1)

        return {
          id: conversation.id,
          updated_at: conversation.updated_at,
          otherUser: {
            id: otherUserId,
            display_name: profile?.display_name ?? 'User',
            avatar_url: profile?.avatar_url ?? null,
          },
          lastMessage: lastMessages?.[0] ?? null,
        } satisfies ConversationPreview
      }),
    )

    setConversations(
      previews.filter((preview): preview is ConversationPreview => preview !== null),
    )
  }, [userId])

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!supabase) return

    const { data, error: messageError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (messageError) {
      setError(messageError.message)
      return
    }

    setMessages(data ?? [])
  }, [])

  const openConversation = useCallback(
    async (conversationId: string) => {
      setActiveConversationId(conversationId)
      setView('thread')
      setPanelOpen(true)
      setError(null)
      await loadMessages(conversationId)
    },
    [loadMessages],
  )

  const startConversationWith = useCallback(
    async (otherUserId: string) => {
      if (!supabase || !userId) return
      if (otherUserId === userId) return

      setLoading(true)
      setError(null)

      const { data, error: rpcError } = await supabase.rpc(
        'get_or_create_conversation',
        { other_user_id: otherUserId },
      )

      setLoading(false)

      if (rpcError) {
        setError(rpcError.message)
        return
      }

      await loadConversations()
      if (data) {
        await openConversation(data)
      }
    },
    [loadConversations, openConversation, userId],
  )

  const sendMessage = useCallback(
    async (body: string) => {
      if (!supabase || !userId || !activeConversationId) return

      const trimmed = body.trim()
      if (!trimmed) return

      setSending(true)
      setError(null)

      const { error: sendError } = await supabase.from('messages').insert({
        conversation_id: activeConversationId,
        sender_id: userId,
        body: trimmed,
      })

      setSending(false)

      if (sendError) {
        setError(sendError.message)
        return
      }

      await loadMessages(activeConversationId)
      await loadConversations()
    },
    [activeConversationId, loadConversations, loadMessages, userId],
  )

  const openPanel = useCallback(() => {
    setPanelOpen(true)
    setView(activeConversationId ? 'thread' : 'list')
  }, [activeConversationId])

  const closePanel = useCallback(() => {
    setPanelOpen(false)
  }, [])

  const backToList = useCallback(() => {
    setView('list')
    setActiveConversationId(null)
    setMessages([])
  }, [])

  useEffect(() => {
    if (!supabase || !userId) {
      setConversations([])
      setMessages([])
      setActiveConversationId(null)
      setPanelOpen(false)
      return
    }

    void loadConversations()

    const client = supabase

    const channel = client
      .channel(`messages:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const message = payload.new as Message
          if (message.conversation_id === activeConversationIdRef.current) {
            setMessages((current) => {
              if (current.some((item) => item.id === message.id)) return current
              return [...current, message]
            })
          }
          void loadConversations()
        },
      )
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [loadConversations, userId])

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ??
    null

  return {
    panelOpen,
    view,
    conversations,
    activeConversationId,
    activeConversation,
    messages,
    loading,
    sending,
    error,
    openPanel,
    closePanel,
    backToList,
    openConversation,
    startConversationWith,
    sendMessage,
  }
}
