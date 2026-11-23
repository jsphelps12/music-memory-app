/**
 * Generated from the production Supabase schema (project izfhbtipzuvinyacttin).
 *
 * Regenerate after any migration:
 *   npx supabase login          # must be the account that owns the Soundtracks project
 *   npx supabase gen types typescript --project-id izfhbtipzuvinyacttin > types/database.ts
 * (or the project-scoped `supabase` MCP server's generate_typescript_types),
 * then put this header back.
 *
 * Last regenerated 2026-11-23 (after 20261123000000_db2_prep_album_reads).
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
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      collection_friend_invites: {
        Row: {
          collection_id: string
          created_at: string
          from_user: string
          notified_at: string | null
          responded_at: string | null
          status: string
          to_user: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          from_user: string
          notified_at?: string | null
          responded_at?: string | null
          status?: string
          to_user: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          from_user?: string
          notified_at?: string | null
          responded_at?: string | null
          status?: string
          to_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_friend_invites_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
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
        Relationships: [
          {
            foreignKeyName: "collection_invites_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "collection_members_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "collection_moments_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_moments_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
        ]
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
      moment_people_links: {
        Row: {
          created_at: string
          friend_id: string
          moment_id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          moment_id: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          moment_id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_people_links_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_people_links_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "moment_reactions_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_shares: {
        Row: {
          created_at: string
          id: string
          moment_id: string
          recipient_id: string
          sender_id: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          moment_id: string
          recipient_id: string
          sender_id: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          moment_id?: string
          recipient_id?: string
          sender_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moment_shares_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
        ]
      }
      moments: {
        Row: {
          capture_source: string | null
          created_at: string
          guest_name: string | null
          guest_uuid: string | null
          id: string
          location: string | null
          location_lat: number | null
          location_lng: number | null
          media_refs: Json
          moment_date: string | null
          mood: string | null
          moods: string[] | null
          people: string[] | null
          photo_thumbnails: string[] | null
          photo_urls: string[] | null
          reflection_text: string
          share_token: string | null
          song_album_id: string | null
          song_album_name: string | null
          song_apple_music_id: string | null
          song_artist: string
          song_artist_id: string | null
          song_artwork_url: string | null
          song_duration_ms: number | null
          song_genre: string | null
          song_preview_url: string | null
          song_provider: string
          song_release_date: string | null
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
          capture_source?: string | null
          created_at?: string
          guest_name?: string | null
          guest_uuid?: string | null
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          media_refs?: Json
          moment_date?: string | null
          mood?: string | null
          moods?: string[] | null
          people?: string[] | null
          photo_thumbnails?: string[] | null
          photo_urls?: string[] | null
          reflection_text?: string
          share_token?: string | null
          song_album_id?: string | null
          song_album_name?: string | null
          song_apple_music_id?: string | null
          song_artist: string
          song_artist_id?: string | null
          song_artwork_url?: string | null
          song_duration_ms?: number | null
          song_genre?: string | null
          song_preview_url?: string | null
          song_provider?: string
          song_release_date?: string | null
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
          capture_source?: string | null
          created_at?: string
          guest_name?: string | null
          guest_uuid?: string | null
          id?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          media_refs?: Json
          moment_date?: string | null
          mood?: string | null
          moods?: string[] | null
          people?: string[] | null
          photo_thumbnails?: string[] | null
          photo_urls?: string[] | null
          reflection_text?: string
          share_token?: string | null
          song_album_id?: string | null
          song_album_name?: string | null
          song_apple_music_id?: string | null
          song_artist?: string
          song_artist_id?: string | null
          song_artwork_url?: string | null
          song_duration_ms?: number | null
          song_genre?: string | null
          song_preview_url?: string | null
          song_provider?: string
          song_release_date?: string | null
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
      occasion_deletions: {
        Row: {
          deleted_at: string
          occasion_id: string
          paid_at: string | null
          slug: string
          stripe_checkout_id: string | null
        }
        Insert: {
          deleted_at?: string
          occasion_id: string
          paid_at?: string | null
          slug: string
          stripe_checkout_id?: string | null
        }
        Update: {
          deleted_at?: string
          occasion_id?: string
          paid_at?: string | null
          slug?: string
          stripe_checkout_id?: string | null
        }
        Relationships: []
      }
      occasion_entries: {
        Row: {
          created_at: string
          device_id: string | null
          edit_token_hash: string
          gallery_photo_id: string | null
          guest_email: string | null
          guest_name: string
          hidden: boolean
          id: string
          ip_hash: string | null
          occasion_id: string
          photo_path: string | null
          photo_source: string | null
          song_album: string | null
          song_apple_id: string
          song_artist: string
          song_artwork_url: string | null
          song_preview_url: string | null
          song_title: string
          updated_at: string
          words: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          edit_token_hash: string
          gallery_photo_id?: string | null
          guest_email?: string | null
          guest_name: string
          hidden?: boolean
          id?: string
          ip_hash?: string | null
          occasion_id: string
          photo_path?: string | null
          photo_source?: string | null
          song_album?: string | null
          song_apple_id: string
          song_artist: string
          song_artwork_url?: string | null
          song_preview_url?: string | null
          song_title: string
          updated_at?: string
          words?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          edit_token_hash?: string
          gallery_photo_id?: string | null
          guest_email?: string | null
          guest_name?: string
          hidden?: boolean
          id?: string
          ip_hash?: string | null
          occasion_id?: string
          photo_path?: string | null
          photo_source?: string | null
          song_album?: string | null
          song_apple_id?: string
          song_artist?: string
          song_artwork_url?: string | null
          song_preview_url?: string | null
          song_title?: string
          updated_at?: string
          words?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "occasion_entries_gallery_photo_id_occasion_id_fkey"
            columns: ["gallery_photo_id", "occasion_id"]
            isOneToOne: false
            referencedRelation: "occasion_gallery_photos"
            referencedColumns: ["id", "occasion_id"]
          },
          {
            foreignKeyName: "occasion_entries_occasion_id_fkey"
            columns: ["occasion_id"]
            isOneToOne: false
            referencedRelation: "occasions"
            referencedColumns: ["id"]
          },
        ]
      }
      occasion_gallery_photos: {
        Row: {
          created_at: string
          height: number | null
          id: string
          occasion_id: string
          path: string
          taken_at: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          occasion_id: string
          path: string
          taken_at?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          occasion_id?: string
          path?: string
          taken_at?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "occasion_gallery_photos_occasion_id_fkey"
            columns: ["occasion_id"]
            isOneToOne: false
            referencedRelation: "occasions"
            referencedColumns: ["id"]
          },
        ]
      }
      occasions: {
        Row: {
          book_token: string
          city: string | null
          co_host_user_id: string | null
          cohost_invite_expires_at: string | null
          cohost_invite_hash: string | null
          collect_closes_at: string | null
          created_at: string
          event_date: string
          guest_estimate: number | null
          host_user_id: string
          id: string
          kind: string
          names: string
          paid_at: string | null
          reservation_id: string | null
          revealed_at: string | null
          share_book_with_guests: boolean
          slug: string
          status: string
          stripe_checkout_id: string | null
          suggested_songs: Json
          time_zone: string
          updated_at: string
        }
        Insert: {
          book_token?: string
          city?: string | null
          co_host_user_id?: string | null
          cohost_invite_expires_at?: string | null
          cohost_invite_hash?: string | null
          collect_closes_at?: string | null
          created_at?: string
          event_date: string
          guest_estimate?: number | null
          host_user_id: string
          id?: string
          kind?: string
          names: string
          paid_at?: string | null
          reservation_id?: string | null
          revealed_at?: string | null
          share_book_with_guests?: boolean
          slug: string
          status?: string
          stripe_checkout_id?: string | null
          suggested_songs?: Json
          time_zone?: string
          updated_at?: string
        }
        Update: {
          book_token?: string
          city?: string | null
          co_host_user_id?: string | null
          cohost_invite_expires_at?: string | null
          cohost_invite_hash?: string | null
          collect_closes_at?: string | null
          created_at?: string
          event_date?: string
          guest_estimate?: number | null
          host_user_id?: string
          id?: string
          kind?: string
          names?: string
          paid_at?: string | null
          reservation_id?: string | null
          revealed_at?: string | null
          share_book_with_guests?: boolean
          slug?: string
          status?: string
          stripe_checkout_id?: string | null
          suggested_songs?: Json
          time_zone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "occasions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "wedding_reservations"
            referencedColumns: ["id"]
          },
        ]
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
          last_notified_at: string | null
          last_reengagement_at: string | null
          notif_frequency: string
          notif_last_week: boolean
          notif_milestones: boolean | null
          notif_on_this_day: boolean | null
          notif_prompts: boolean | null
          notif_quiet_hours: boolean
          notif_resurfacing: boolean | null
          notif_social: boolean
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
          last_notified_at?: string | null
          last_reengagement_at?: string | null
          notif_frequency?: string
          notif_last_week?: boolean
          notif_milestones?: boolean | null
          notif_on_this_day?: boolean | null
          notif_prompts?: boolean | null
          notif_quiet_hours?: boolean
          notif_resurfacing?: boolean | null
          notif_social?: boolean
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
          last_notified_at?: string | null
          last_reengagement_at?: string | null
          notif_frequency?: string
          notif_last_week?: boolean
          notif_milestones?: boolean | null
          notif_on_this_day?: boolean | null
          notif_prompts?: boolean | null
          notif_quiet_hours?: boolean
          notif_resurfacing?: boolean | null
          notif_social?: boolean
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
        Relationships: [
          {
            foreignKeyName: "tagged_moments_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
        ]
      }
      wedding_reservations: {
        Row: {
          couple_names: string
          created_at: string
          email: string
          guest_count: number
          id: string
          interests: string[]
          wedding_date: string
        }
        Insert: {
          couple_names: string
          created_at?: string
          email: string
          guest_count: number
          id?: string
          interests?: string[]
          wedding_date: string
        }
        Update: {
          couple_names?: string
          created_at?: string
          email?: string
          guest_count?: number
          id?: string
          interests?: string[]
          wedding_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_cohost_invite: { Args: { p_token: string }; Returns: string }
      activate_occasion: {
        Args: { p_checkout_id?: string; p_occasion_id: string }
        Returns: {
          book_token: string
          city: string | null
          co_host_user_id: string | null
          cohost_invite_expires_at: string | null
          cohost_invite_hash: string | null
          collect_closes_at: string | null
          created_at: string
          event_date: string
          guest_estimate: number | null
          host_user_id: string
          id: string
          kind: string
          names: string
          paid_at: string | null
          reservation_id: string | null
          revealed_at: string | null
          share_book_with_guests: boolean
          slug: string
          status: string
          stripe_checkout_id: string | null
          suggested_songs: Json
          time_zone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "occasions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_overview: { Args: never; Returns: Json }
      check_moment_owner: { Args: { p_moment_id: string }; Returns: boolean }
      claim_gifted_moment: {
        Args: { p_share_token: string }
        Returns: undefined
      }
      close_occasion: {
        Args: { p_occasion_id: string }
        Returns: {
          book_token: string
          city: string | null
          co_host_user_id: string | null
          cohost_invite_expires_at: string | null
          cohost_invite_hash: string | null
          collect_closes_at: string | null
          created_at: string
          event_date: string
          guest_estimate: number | null
          host_user_id: string
          id: string
          kind: string
          names: string
          paid_at: string | null
          reservation_id: string | null
          revealed_at: string | null
          share_book_with_guests: boolean
          slug: string
          status: string
          stripe_checkout_id: string | null
          suggested_songs: Json
          time_zone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "occasions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_cohost_invite: { Args: { p_occasion_id: string }; Returns: string }
      create_occasion_draft: {
        Args: {
          p_city: string
          p_event_date: string
          p_guest_estimate: number
          p_names: string
          p_reservation_id?: string
          p_slug: string
          p_suggested_songs: Json
          p_time_zone: string
        }
        Returns: {
          id: string
          slug: string
        }[]
      }
      get_album_artworks: {
        Args: { p_collection_ids: string[] }
        Returns: {
          artwork_urls: string[]
          collection_id: string
        }[]
      }
      get_album_invitee_ids: {
        Args: { p_collection_id: string }
        Returns: string[]
      }
      get_moment_view: { Args: { p_moment_id: string }; Returns: Json }
      get_my_profile: {
        Args: never
        Returns: {
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
          last_notified_at: string | null
          last_reengagement_at: string | null
          notif_frequency: string
          notif_last_week: boolean
          notif_milestones: boolean | null
          notif_on_this_day: boolean | null
          notif_prompts: boolean | null
          notif_quiet_hours: boolean
          notif_resurfacing: boolean | null
          notif_social: boolean
          notif_streak: boolean | null
          onboarding_completed: boolean
          preferred_music_provider: string
          profile_visibility: string
          push_token: string | null
          timezone: string | null
          updated_at: string
          username: string | null
          username_customized: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_occasion_for_guests: { Args: { p_slug: string }; Returns: Json }
      get_profile_by_invite_token: {
        Args: { p_token: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          username: string
        }[]
      }
      get_public_album_moments: {
        Args: {
          p_after?: string
          p_invite_code: string
          p_oldest_first?: boolean
        }
        Returns: Json[]
      }
      get_public_profiles: {
        Args: { p_ids: string[] }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          username: string
        }[]
      }
      get_random_forgotten_moment: {
        Args: { p_cutoff: string }
        Returns: Database["public"]["Tables"]["moments"]["Row"][]
        SetofOptions: {
          from: "*"
          to: "moments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_random_moment: {
        Args: never
        Returns: Database["public"]["Tables"]["moments"]["Row"][]
        SetofOptions: {
          from: "*"
          to: "moments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_shared_collection_moments: {
        Args: { p_collection_id: string }
        Returns: Json[]
      }
      get_shared_moment: { Args: { p_token: string }; Returns: Json }
      get_shared_with_me: {
        Args: { p_limit?: number; p_offset?: number }
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
      invite_to_album: {
        Args: { p_collection_id: string; p_friend_ids: string[] }
        Returns: number
      }
      is_friends_with: { Args: { p_other: string }; Returns: boolean }
      is_occasion_host: { Args: { p_occasion_id: string }; Returns: boolean }
      is_occasion_host_folder: { Args: { p_folder: string }; Returns: boolean }
      moment_view_for: {
        Args: {
          p_moment: Database["public"]["Tables"]["moments"]["Row"]
          p_viewer: string
        }
        Returns: Json
      }
      my_wedding_reservations: {
        Args: never
        Returns: {
          couple_names: string
          guest_count: number
          id: string
          wedding_date: string
        }[]
      }
      occasion_hosts: { Args: { p_occasion_id: string }; Returns: Json }
      occasion_invite_hash: { Args: { p_token: string }; Returns: string }
      occasion_slug_available: { Args: { p_slug: string }; Returns: boolean }
      occasion_slug_reserved: { Args: { p_slug: string }; Returns: boolean }
      occasion_slug_retired: { Args: { p_slug: string }; Returns: boolean }
      occasion_slug_shape: { Args: { p_slug: string }; Returns: boolean }
      occasion_slug_valid: { Args: { p_slug: string }; Returns: boolean }
      occasion_songs_valid: { Args: { p_songs: Json }; Returns: boolean }
      occasions_tick: {
        Args: never
        Returns: {
          closed: number
          revealed: number
        }[]
      }
      open_shared_moment: { Args: { p_token: string }; Returns: Json }
      owns_moment: { Args: { p_moment_id: string }; Returns: boolean }
      peek_cohost_invite: { Args: { p_token: string }; Returns: Json }
      remove_cohost: { Args: { p_occasion_id: string }; Returns: undefined }
      respond_to_album_invite: {
        Args: { p_accept: boolean; p_collection_id: string }
        Returns: string
      }
      reveal_occasion: {
        Args: { p_occasion_id: string }
        Returns: {
          book_token: string
          city: string | null
          co_host_user_id: string | null
          cohost_invite_expires_at: string | null
          cohost_invite_hash: string | null
          collect_closes_at: string | null
          created_at: string
          event_date: string
          guest_estimate: number | null
          host_user_id: string
          id: string
          kind: string
          names: string
          paid_at: string | null
          reservation_id: string | null
          revealed_at: string | null
          share_book_with_guests: boolean
          slug: string
          status: string
          stripe_checkout_id: string | null
          suggested_songs: Json
          time_zone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "occasions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_occasion_slug: {
        Args: { p_occasion_id: string; p_slug: string }
        Returns: string
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
