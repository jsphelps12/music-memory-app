export interface MoodDefinition {
  value: string;
  label: string;
  emoji: string;
}

export const MOODS: MoodDefinition[] = [
  { value: "nostalgic", label: "Nostalgic", emoji: "🕰️" },
  { value: "joyful", label: "Joyful", emoji: "😊" },
  { value: "melancholy", label: "Melancholy", emoji: "🌧️" },
  { value: "energetic", label: "Energetic", emoji: "⚡" },
  { value: "peaceful", label: "Peaceful", emoji: "🌿" },
  { value: "romantic", label: "Romantic", emoji: "💕" },
  { value: "rebellious", label: "Rebellious", emoji: "🔥" },
  { value: "hopeful", label: "Hopeful", emoji: "🌅" },
  { value: "bittersweet", label: "Bittersweet", emoji: "🍂" },
  { value: "empowered", label: "Empowered", emoji: "💪" },
];
