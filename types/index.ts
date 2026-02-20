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
}

export interface UserProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  customMoods: CustomMoodDefinition[];
  createdAt: string;
  updatedAt: string;
}
