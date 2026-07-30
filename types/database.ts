/**
 * Generated from the production Supabase schema (project izfhbtipzuvinyacttin).
 *
 * Regenerate after any migration:
 *   npx supabase login          # must be the account that owns the Soundtracks project
 *   npx supabase gen types typescript --project-id izfhbtipzuvinyacttin > types/database.ts
 *
 * Do not edit by hand.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      collection_invites: {
        Row: {
          collection_id: string
          created_at: string | null
          id: string
          invitee_id: string
          inviter_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string | null
          id?: string
          invitee_id: string
          inviter_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string | null
          id?: string
          invitee_id?: string
          inviter_id?: string
        }
        Relationships: []
      }
      collection_members: {
        Row: {
          collection_id: string
          joined_at: string | null
          last_viewed_at: string | null
          user_id: string
        }
        Insert: {
          collection_id: string
          joined_at?: string | null
          last_viewed_at?: string | null
          user_id: string
        }
        Update: {
          collection_id?: string
          joined_at?: string | null
          last_viewed_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      collection_moments: {
        Row: {
          added_at: string | null
          added_by_user_id: string | null
          collection_id: string
          moment_id: string
        }
        Insert: {
          added_at?: string | null
          added_by_user_id?: string | null
          collection_id: string
          moment_id: string
        }
        Update: {
          added_at?: string | null
          added_by_user_id?: string | null
          collection_id?: string
          moment_id?: string
        }
        Relationships: []
      }
      collections: {
        Row: {
          cover_photo_url: string | null
          created_at: string | null
          date_from: string | null
          date_to: string | null
          events_tier_unlocked: boolean
          guest_user_id: string | null
          id: string
          invite_code: string
          is_public: boolean
          name: string
          owner_last_viewed_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cover_photo_url?: string | null
          created_at?: string | null
          date_from?: string | null
          date_to?: string | null
          events_tier_unlocked?: boolean
          guest_user_id?: string | null
          id?: string
          invite_code: string
          is_public?: boolean
          name: string
          owner_last_viewed_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cover_photo_url?: string | null
          created_at?: string | null
          date_from?: string | null
          date_to?: string | null
          events_tier_unlocked?: boolean
          guest_user_id?: string | null
          id?: string
          invite_code?: string
          is_public?: boolean
          name?: string
          owner_last_viewed_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      moment_reactions: {
        Row: {
          created_at: string | null
          id: string
          moment_id: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          moment_id: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          moment_id?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      moments: {
        Row: {
          created_at: string
          guest_name: string | null
          guest_uuid: string | null
          id: string
          location: string | null
          location_lat: number | null
          location_lng: number | null
          moment_date: string | null
          mood: string | null
          people: string[] | null
          photo_thumbnails: string[] | null
          photo_urls: string[] | null
          reflection_text: string
          share_token: string | null
          song_album_name: string | null
          song_apple_music_id: string | null
          song_artist: string
          song_artwork_url: string | null
          song_preview_url: string | null
          song_provider: string
          song_spotify_id: string | null
          song_title: string
          time_of_day: string | null
          updated_at: string
          user_id: string
          visibility: string
          weather_condition: string | null
          weather_temp_f: number | null
        }
        Insert: {
          created_at?: string
          guest_name?: string | null
          guest_uuid?: string | null
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          moment_date?: string | null
          mood?: string | null
          people?: string[] | null
          photo_thumbnails?: string[] | null
          photo_urls?: string[] | null
          reflection_text?: string
          share_token?: string | null
          song_album_name?: string | null
          song_apple_music_id?: string | null
          song_artist: string
          song_artwork_url?: string | null
          song_preview_url?: string | null
          song_provider?: string
          song_spotify_id?: string | null
          song_title: string
          time_of_day?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
          weather_condition?: string | null
          weather_temp_f?: number | null
        }
        Update: {
          created_at?: string
          guest_name?: string | null
          guest_uuid?: string | null
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          moment_date?: string | null
          mood?: string | null
          people?: string[] | null
          photo_thumbnails?: string[] | null
          photo_urls?: string[] | null
          reflection_text?: string
          share_token?: string | null
          song_album_name?: string | null
          song_apple_music_id?: string | null
          song_artist?: string
          song_artwork_url?: string | null
          song_preview_url?: string | null
          song_provider?: string
          song_spotify_id?: string | null
          song_title?: string
          time_of_day?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
          weather_condition?: string | null
          weather_temp_f?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_year: number | null
          country: string | null
          created_at: string
          custom_moods: Json | null
          custom_prompt_categories: Json | null
          display_name: string | null
          favorite_artists: Json
          favorite_songs: Json
          friend_invite_token: string
          genre_preferences: string[] | null
          id: string
          notif_milestones: boolean | null
          notif_on_this_day: boolean | null
          notif_prompts: boolean | null
          notif_resurfacing: boolean | null
          notif_streak: boolean | null
          onboarding_completed: boolean
          preferred_music_provider: string
          profile_visibility: string
          push_token: string | null
          timezone: string | null
          updated_at: string
          username: string | null
          username_customized: boolean
        }
        Insert: {
          avatar_url?: string | null
          birth_year?: number | null
          country?: string | null
          created_at?: string
          custom_moods?: Json | null
          custom_prompt_categories?: Json | null
          display_name?: string | null
          favorite_artists?: Json
          favorite_songs?: Json
          friend_invite_token?: string
          genre_preferences?: string[] | null
          id: string
          notif_milestones?: boolean | null
          notif_on_this_day?: boolean | null
          notif_prompts?: boolean | null
          notif_resurfacing?: boolean | null
          notif_streak?: boolean | null
          onboarding_completed?: boolean
          preferred_music_provider?: string
          profile_visibility?: string
          push_token?: string | null
          timezone?: string | null
          updated_at?: string
          username?: string | null
          username_customized?: boolean
        }
        Update: {
          avatar_url?: string | null
          birth_year?: number | null
          country?: string | null
          created_at?: string
          custom_moods?: Json | null
          custom_prompt_categories?: Json | null
          display_name?: string | null
          favorite_artists?: Json
          favorite_songs?: Json
          friend_invite_token?: string
          genre_preferences?: string[] | null
          id?: string
          notif_milestones?: boolean | null
          notif_on_this_day?: boolean | null
          notif_prompts?: boolean | null
          notif_resurfacing?: boolean | null
          notif_streak?: boolean | null
          onboarding_completed?: boolean
          preferred_music_provider?: string
          profile_visibility?: string
          push_token?: string | null
          timezone?: string | null
          updated_at?: string
          username?: string | null
          username_customized?: boolean
        }
        Relationships: []
      }
      tagged_moments: {
        Row: {
          created_at: string
          id: string
          moment_id: string
          released: boolean
          status: string
          tag_token: string
          tagged_user_id: string
          tagger_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          moment_id: string
          released?: boolean
          status?: string
          tag_token?: string
          tagged_user_id: string
          tagger_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          moment_id?: string
          released?: boolean
          status?: string
          tag_token?: string
          tagged_user_id?: string
          tagger_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_moment_owner: { Args: { p_moment_id: string }; Returns: boolean }
      claim_gifted_moment: { Args: { p_share_token: string }; Returns: undefined }
      get_random_forgotten_moment: {
        Args: { p_cutoff: string }
        Returns: Database["public"]["Tables"]["moments"]["Row"][]
      }
      get_random_moment: {
        Args: never
        Returns: Database["public"]["Tables"]["moments"]["Row"][]
      }
      get_shared_collection_moments: {
        Args: { p_collection_id: string }
        Returns: Json[]
      }
      get_tagged_moment_data: {
        Args: { p_moment_ids: string[] }
        Returns: {
          created_at: string
          guest_name: string
          guest_uuid: string
          id: string
          moment_date: string
          mood: string
          photo_thumbnails: string[]
          photo_urls: string[]
          reflection_text: string
          song_album_name: string
          song_apple_music_id: string
          song_artist: string
          song_artwork_url: string
          song_preview_url: string
          song_title: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

/** Row type for a table, e.g. `Tables<"moments">`. */
export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"]

/** Insert payload for a table, e.g. `TablesInsert<"moments">`. */
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"]

/** Update payload for a table, e.g. `TablesUpdate<"moments">`. */
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"]

// Convenience aliases for the tables touched most often.
export type MomentRow = Tables<"moments">
export type ProfileRow = Tables<"profiles">
export type CollectionRow = Tables<"collections">
export type FriendshipRow = Tables<"friendships">
export type TaggedMomentRow = Tables<"tagged_moments">
