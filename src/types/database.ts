export type Profile = {
  id: string
  display_name: string
  avatar_url: string | null
  description: string | null
  social_links: string[]
  created_at: string
}

export type UserLocation = {
  user_id: string
  world_x: number
  world_y: number
  is_active: boolean
  updated_at: string
}

export type UserBox = UserLocation & {
  display_name: string
  avatar_url: string | null
  description: string | null
  social_links: string[]
  isSelf: boolean
}

export type ProfileUpdates = {
  display_name: string
  avatar_url: string | null
  description: string | null
  social_links: string[]
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

export type ConversationPreview = {
  id: string
  updated_at: string
  otherUser: {
    id: string
    display_name: string
    avatar_url: string | null
  }
  lastMessage: {
    body: string
    created_at: string
    sender_id: string
  } | null
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: {
          id: string
          display_name: string
          avatar_url?: string | null
          description?: string | null
          social_links?: string[]
        }
        Update: {
          display_name?: string
          avatar_url?: string | null
          description?: string | null
          social_links?: string[]
        }
      }
      user_locations: {
        Row: UserLocation
        Insert: {
          user_id: string
          world_x: number
          world_y: number
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          world_x?: number
          world_y?: number
          is_active?: boolean
          updated_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          updated_at?: string
        }
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          user_id: string
        }
        Update: never
      }
      messages: {
        Row: Message
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          body: string
          created_at?: string
        }
        Update: never
      }
    }
    Functions: {
      get_or_create_conversation: {
        Args: { other_user_id: string }
        Returns: string
      }
    }
  }
}
