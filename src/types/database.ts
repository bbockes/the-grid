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
    }
  }
}
