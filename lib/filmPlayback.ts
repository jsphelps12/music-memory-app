// Timing and loading decisions for the moment film (components/MomentFilm.tsx),
// kept pure so they can be tested. Tested in lib/__tests__/filmPlayback.test.ts.

/** How long a photo holds before the next fades in. */
export const PHOTO_MS = 4000;

/**
 * How long the film waits on the current video item before moving on by
 * itself, or null when the video's own end moves it on (or nothing should).
 *
 * A video that can't play here (not linked, someone else's, failed) holds
 * its poster like a photo. So does one that is still loading when it comes
 * up (a large iCloud original): its poster shows for PHOTO_MS and, if the
 * video still isn't ready, the film moves on rather than waiting on a
 * spinner. If it gets ready in time it plays through as usual. A single
 * item (looping) or a paused film never moves on by itself.
 */
export function videoHoldMs(state: {
  active: boolean;
  playing: boolean;
  loop: boolean;
  /** A linked video this phone can play and that hasn't failed. */
  usable: boolean;
  ready: boolean;
}): number | null {
  if (!state.active || !state.playing || state.loop) return null;
  if (state.usable && state.ready) return null;
  return PHOTO_MS;
}

/**
 * How item `i` loads its video from Photos, or null when it stays a poster.
 *
 * - "full": the item on screen, the original quality (iCloud streaming if
 *   need be).
 * - "light": the next item, loaded ahead so the fade into it is smooth, and
 *   the item it's fading out of (it keeps its last frame). The native view
 *   (modules/photos-video) takes a copy already on the phone if there is one,
 *   else Photos' lighter streaming version, and buffers only a few seconds,
 *   so a film never pulls several full iCloud originals at once.
 * - null: every other item (the one behind stays mounted as a poster).
 */
export type VideoLoad = "full" | "light" | null;

export function videoLoad(i: number, index: number, under: number | null, count: number): VideoLoad {
  if (i === index) return "full";
  if (i === under) return "light";
  return count > 1 && i === (index + 1) % count ? "light" : null;
}

/** Whether item `i` loads its video at all (see videoLoad). */
export function loadsVideo(i: number, index: number, under: number | null, count: number): boolean {
  return videoLoad(i, index, under, count) !== null;
}

// ── The owner's voice (1.5, docs/PLAN-1.5.md decision 8) ───────────────────
//
// "Over the song, with the music turned down." A moment's recording plays in
// its film for its owner only (the shared view never carries it), and only
// when the film plays as a film: more than one item, the song started with
// it. A single photo opened from the page stays a quiet photo viewer.
//
// When: the song goes first. The voice comes in VOICE_LEAD_MS after the song
// is heard in the film (a song already playing when the film opens counts
// from the opening), so the memory starts with the music and the voice
// arrives over it rather than at the same instant. If the song isn't playing
// (offline, a song that can't play, Apple Music slow to start), the voice
// waits VOICE_SONG_WAIT_MS from the film starting and plays on its own; a
// song that starts after that comes in under it, turned down.
//
// How long: the film has no length of its own. It loops its photos until
// it's closed and the song plays on under it (a 30-second preview stops at
// its end, full playback runs to the end of the song). So a recording is
// never cut to fit, and the film doesn't stretch to fit it either: it plays
// once, start to end (up to the 3-minute cap, lib/voice.ts MAX_VOICE_MS),
// while the photos keep their PHOTO_MS pace and loop around it. The song
// comes back up when it ends. Cutting someone off mid-sentence because the
// photos ran out would be the wrong thing for a memory.
//
// Once per opening: looping back to the first photo doesn't replay it, and
// skipping photos (tap, swipe) doesn't touch it, since it belongs to the
// moment, not to a photo. Pause pauses it with everything else and Play
// carries on from where it was (a pause during the lead-in starts the lead-in
// again). Closing and opening the film again plays it from the top.
//
// It gives way: while a clip's own sound is on (the speaker button), or the
// person turned the voice off, it waits where it is; while the app is in the
// background it pauses. A recording that can't be had (offline, a signed URL
// that won't load) or goes quiet for VOICE_STALL_MS is dropped for this
// viewing: the film plays without it and says nothing.

/** The song on its own before the voice comes in over it. */
export const VOICE_LEAD_MS = 2500;
/** With no song playing, how long the voice waits for one before playing alone. */
export const VOICE_SONG_WAIT_MS = 6000;
/** Wanted but not heard for this long (loading offline, stalled, failed): dropped. */
export const VOICE_STALL_MS = 8000;

/**
 * Where the voice is in this opening of the film: still to come (the lead-in
 * runs while the film plays), begun (playing, or waiting where it is), or
 * over (played to its end, or dropped).
 */
export type FilmVoicePhase = "waiting" | "started" | "done";

export interface FilmVoiceState {
  phase: FilmVoicePhase;
  /** The film is open, not paused, and the app is in front. */
  filmPlaying: boolean;
  /** The moment's song is playing. */
  songPlaying: boolean;
  /** Something has the floor instead: a clip's own sound, or the voice turned off. */
  held: boolean;
}

/** Whether the film plays a recording at all: the owner's own, in a real film. */
export function filmPlaysVoice(s: { hasRecording: boolean; ownMoment: boolean; filmLike: boolean }): boolean {
  return s.hasRecording && s.ownMoment && s.filmLike;
}

/** Milliseconds until the voice starts, or null while it isn't counting down. */
export function voiceStartInMs(s: FilmVoiceState): number | null {
  if (s.phase !== "waiting" || !s.filmPlaying || s.held) return null;
  return s.songPlaying ? VOICE_LEAD_MS : VOICE_SONG_WAIT_MS;
}

/** Whether the voice should be sounding now. */
export function voiceSounds(s: Pick<FilmVoiceState, "phase" | "filmPlaying" | "held">): boolean {
  return s.phase === "started" && s.filmPlaying && !s.held;
}

// ── Who has the song: the voice, a clip's sound ─────────────────────────────
//
// The voice and a clip's sound turn the song down the same way
// (lib/audioMix.ts): a preview fades down, full Apple Music playback is
// ducked by iOS ("duck others", modules/photos-video). When iOS refuses, the
// song is paused instead and "held" by whoever paused it, and only that one
// starts it again. These are the decisions hooks/useFilmVoice.ts and
// components/MomentFilm.tsx act on.

/** How the song is turned down under something: a preview's fade, iOS ducking full playback, or nothing to do. */
export type SongDuck = "preview" | "others" | null;

/**
 * How the voice turns the song down once it's heard. Nothing while it isn't
 * heard, once it already has (its MixRestore holds the undo), or while the
 * song is paused for it. "others" can be refused by iOS: then the song is
 * paused for the voice instead (held). A full song that isn't playing yet
 * is left alone, and ducked once it starts under the voice.
 */
export function voiceDuck(s: {
  /** The voice is wanted and playing. */
  audible: boolean;
  /** The voice's duck is already in place. */
  ducked: boolean;
  /** The song is paused for the voice. */
  songHeld: boolean;
  isPreview: boolean;
  songPlaying: boolean;
}): SongDuck {
  if (!s.audible || s.ducked || s.songHeld) return null;
  if (s.isPreview) return "preview";
  return s.songPlaying ? "others" : null;
}

/** What happens to a song paused for the voice. */
export type HeldSongAction = "keep" | "resume" | "release";

/**
 * A song paused for the voice comes back when the voice stops sounding (it
 * ended, was dropped or turned off), but only while the film is open and
 * playing: not after a close or a pause ("release": let go, don't start it).
 * In the background it waits ("keep"): the voice carries on when the app is
 * back in front.
 */
export function heldSongAction(s: {
  songHeld: boolean;
  /** The voice should be sounding now (voiceSounds). */
  voiceWanted: boolean;
  visible: boolean;
  paused: boolean;
  appActive: boolean;
}): HeldSongAction {
  if (!s.songHeld || s.voiceWanted) return "keep";
  if (s.visible && !s.paused) return s.appActive ? "resume" : "keep";
  return "release";
}

/**
 * Turning a clip's sound on. The voice steps aside first; if it had the song
 * paused (iOS wouldn't duck it), the clip takes that pause over
 * ("takeHeldSong"): the song stays paused under the clip and comes back when
 * the clip's sound goes off, never at full volume under it. Otherwise the
 * song is turned down like for the voice ("others" can be refused, and then
 * the song pauses for the clip).
 */
export function clipSoundDuck(s: {
  /** The voice had the song paused until now. */
  voiceHeldSong: boolean;
  isPreview: boolean;
  songPlaying: boolean;
}): SongDuck | "takeHeldSong" {
  if (s.voiceHeldSong) return "takeHeldSong";
  if (s.isPreview) return "preview";
  return s.songPlaying ? "others" : null;
}
