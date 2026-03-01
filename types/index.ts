export interface Song {
  id: string;
  title: string;
  artistName: string;
  albumName: string;
  artworkUrl: string;
  appleMusicId: string;
  durationMs: number;
}

export type MoodOption = string;

export interface CustomMoodDefinition {
  value: string;
  label: string;
  emoji: string;
}

export interface CustomPromptCategory {
  id: string;
  label: string;
  starters: string[];
}

export interface Moment {
  id: string;
  userId: string;
  songTitle: string;
  songArtist: string;
  songAlbumName: string;
  songArtworkUrl: string;
  songAppleMusicId: string;
  songPreviewUrl: string | null;
  reflectionText: string;
  photoUrls: string[];
  photoThumbnails: string[];
  mood: MoodOption | null;
  people: string[];
  location: string | null;
  momentDate: string | null;
  timeOfDay: string | null;
  createdAt: string;
  updatedAt: string;
  shareToken?: string | null;
  // Set when viewing a shared collection — display name of who added this moment
  contributorName?: string | null;
}

export interface Collection {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  momentCount?: number;
  isPublic?: boolean;
  inviteCode?: string;
  role: "owner" | "member";
  ownerName?: string; // only set for role === "member"
}

export interface CollectionPreview {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string | null;
  momentCount: number;
  isPublic: boolean;
  inviteCode: string;
}

export interface UserProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  customMoods: CustomMoodDefinition[];
  customPromptCategories: CustomPromptCategory[];
  createdAt: string;
  updatedAt: string;
}
