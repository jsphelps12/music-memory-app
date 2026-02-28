export interface Prompt {
  question: string;
  starter: string;
}

export interface PromptCategory {
  label: string;
  prompts: Prompt[];
}

export const PROMPT_CATEGORIES: PromptCategory[] = [
  {
    label: "Places",
    prompts: [
      { question: "What song takes you back to a specific road trip?", starter: "This song takes me back to a road trip where..." },
      { question: "Is there a song that reminds you of a city you used to live in?", starter: "This song reminds me of living in..." },
      { question: "What were you listening to the last time you flew somewhere?", starter: "I was listening to this on a flight to..." },
      { question: "What song do you associate with a place you'll never go back to?", starter: "This song takes me back to a place I'll never return to..." },
      { question: "What was playing the first time you drove alone?", starter: "The first time I drove alone, this was playing and..." },
    ],
  },
  {
    label: "People",
    prompts: [
      { question: "What song reminds you of your best friend at a specific moment?", starter: "This song reminds me of a moment with..." },
      { question: "Is there a song that belongs to you and one other person?", starter: "This song belongs to me and..." },
      { question: "What were you listening to when you first fell for someone?", starter: "I was falling for someone when I first heard this..." },
      { question: "What song do you think of when you think of a parent?", starter: "When I think of my... this song comes to mind because..." },
      { question: "What song reminds you of someone you've lost touch with?", starter: "This song reminds me of someone I used to know..." },
    ],
  },
  {
    label: "Firsts",
    prompts: [
      { question: "What song was playing on your first day at a job you remember?", starter: "On my first day at... this song was playing and..." },
      { question: "What were you listening to when you got your first place?", starter: "When I got my first place, I remember listening to this and..." },
      { question: "What song takes you back to your first heartbreak?", starter: "My first heartbreak, I had this on repeat because..." },
      { question: "What was the first concert you ever went to?", starter: "This was the first concert I ever went to, and..." },
      { question: "What song reminds you of learning to drive?", starter: "Learning to drive, this song was always on because..." },
    ],
  },
  {
    label: "Feelings",
    prompts: [
      { question: "What song got you through a hard stretch of your life?", starter: "This got me through a really hard time when..." },
      { question: "What song makes you feel completely invincible?", starter: "This song makes me feel invincible because..." },
      { question: "Is there a song you can't listen to anymore — and why?", starter: "I can't listen to this anymore because..." },
      { question: "What song do you put on when you need to cry?", starter: "I put this on when I need to feel it because..." },
      { question: "What were you listening to during the best summer of your life?", starter: "This defined the best summer of my life because..." },
    ],
  },
  {
    label: "Seasons",
    prompts: [
      { question: "What song defined last summer for you?", starter: "This defined last summer because..." },
      { question: "What do you listen to on a late night drive in winter?", starter: "Late night drives in winter, this always plays because..." },
      { question: "What song feels like the exact mood of autumn to you?", starter: "This song is autumn to me because..." },
      { question: "What were you listening to on the first warm day this year?", starter: "On the first warm day this year, I had this on and..." },
      { question: "What song will always remind you of a specific New Year's Eve?", starter: "This will always remind me of a New Year's Eve when..." },
    ],
  },
];

export const ALL_PROMPTS: Prompt[] = PROMPT_CATEGORIES.flatMap((c) => c.prompts);
