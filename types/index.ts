export interface Song {
  id: string;
  title: string;
  artistName: string;
  albumName: string;
  artworkUrl: string;
  appleMusicId: string;
  durationMs: number;
}

export type MoodOption =
  | "nostalgic"
  | "joyful"
  | "melancholy"
  | "energetic"
  | "peaceful"
  | "romantic"
  | "rebellious"
  | "hopeful"
  | "bittersweet"
  | "empowered";

export interface Moment {
  id: string;
  userId: string;
  songTitle: string;
  songArtist: string;
  songAlbumName: string;
  songArtworkUrl: string;
  songAppleMusicId: string;
  reflectionText: string;
  photoUrls: string[];
  mood: MoodOption;
  people: string[];
  location: string | null;
  momentDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
