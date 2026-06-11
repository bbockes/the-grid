export type Profile = {
  id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

export type UserLocation = {
  user_id: string
  world_x: number
  world_y: number
  updated_at: string
}

export type UserBox = UserLocation & {
  display_name: string
  isSelf: boolean
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
        }
        Update: {
          display_name?: string
          avatar_url?: string | null
        }
      }
      user_locations: {
        Row: UserLocation
        Insert: {
          user_id: string
          world_x: number
          world_y: number
          updated_at?: string
        }
        Update: {
          world_x?: number
          world_y?: number
          updated_at?: string
        }
      }
    }
  }
}
