import { describe, expect, it } from "vitest";
import {
  clipSoundDuck,
  filmPlaysVoice,
  heldSongAction,
  voiceDuck,
  loadsVideo,
  PHOTO_MS,
  videoHoldMs,
  videoLoad,
  VOICE_LEAD_MS,
  VOICE_SONG_WAIT_MS,
  VOICE_STALL_MS,
  voiceSounds,
  voiceStartInMs,
  type FilmVoiceState,
} from "../filmPlayback";
import { MAX_VOICE_MS } from "../voice";

const on = { active: true, playing: true, loop: false, usable: true, ready: true };

describe("videoHoldMs", () => {
  it("a ready video moves on by its own end, not a timer", () => {
    expect(videoHoldMs(on)).toBeNull();
  });

  it("a video still loading when it comes up holds its poster like a photo, then moves on", () => {
    expect(videoHoldMs({ ...on, ready: false })).toBe(PHOTO_MS);
  });

  it("a video that can't play here (or failed) holds its poster like a photo", () => {
    expect(videoHoldMs({ ...on, usable: false, ready: false })).toBe(PHOTO_MS);
    expect(videoHoldMs({ ...on, usable: false })).toBe(PHOTO_MS);
  });

  it("never moves on when paused, off screen, or the only item (looping)", () => {
    expect(videoHoldMs({ ...on, ready: false, playing: false })).toBeNull();
    expect(videoHoldMs({ ...on, ready: false, active: false })).toBeNull();
    expect(videoHoldMs({ ...on, ready: false, loop: true })).toBeNull();
  });
});

describe("loadsVideo", () => {
  const loaded = (index: number, under: number | null, count: number) =>
    Array.from({ length: count }, (_, i) => i).filter((i) => loadsVideo(i, index, under, count));

  it("loads the item on screen and the next one, not the one behind", () => {
    expect(loaded(2, null, 5)).toEqual([2, 3]);
  });

  it("keeps the item fading out loaded, so it holds its last frame", () => {
    expect(loaded(3, 2, 5)).toEqual([2, 3, 4]);
  });

  it("wraps: the last item's next is the first", () => {
    expect(loaded(4, null, 5)).toEqual([0, 4]);
  });

  it("a single item loads only itself; two items both load", () => {
    expect(loaded(0, null, 1)).toEqual([0]);
    expect(loaded(0, null, 2)).toEqual([0, 1]);
  });
});

describe("videoLoad", () => {
  const modes = (index: number, under: number | null, count: number) =>
    Array.from({ length: count }, (_, i) => videoLoad(i, index, under, count));

  it("only the item on screen loads at full quality", () => {
    expect(modes(2, null, 5)).toEqual([null, null, "full", "light", null]);
  });

  it("the next item and the one fading out load light", () => {
    expect(modes(3, 2, 5)).toEqual([null, null, "light", "full", "light"]);
  });

  it("never more than one full load, whatever the position", () => {
    for (let count = 1; count <= 6; count++) {
      for (let index = 0; index < count; index++) {
        for (const under of [null, ...Array.from({ length: count }, (_, i) => i)]) {
          if (under === index) continue;
          const all = modes(index, under, count);
          expect(all.filter((m) => m === "full")).toHaveLength(1);
          expect(all.filter((m) => m !== null).length).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it("a single item is full; going back makes the item left behind light", () => {
    expect(modes(0, null, 1)).toEqual(["full"]);
    expect(modes(1, 2, 4)).toEqual([null, "full", "light", null]);
  });
});

describe("filmPlaysVoice", () => {
  const own = { hasRecording: true, ownMoment: true, filmLike: true };

  it("plays the owner's recording in a film", () => {
    expect(filmPlaysVoice(own)).toBe(true);
  });

  it("never for someone else's moment, a moment without one, or a single photo", () => {
    expect(filmPlaysVoice({ ...own, ownMoment: false })).toBe(false);
    expect(filmPlaysVoice({ ...own, hasRecording: false })).toBe(false);
    expect(filmPlaysVoice({ ...own, filmLike: false })).toBe(false);
  });
});

describe("voiceStartInMs", () => {
  const waiting: FilmVoiceState = { phase: "waiting", filmPlaying: true, songPlaying: true, held: false };

  it("the song goes first: the voice comes in a short lead-in after it's heard", () => {
    expect(voiceStartInMs(waiting)).toBe(VOICE_LEAD_MS);
    expect(VOICE_LEAD_MS).toBeGreaterThanOrEqual(1500);
    expect(VOICE_LEAD_MS).toBeLessThan(PHOTO_MS);
  });

  it("with no song playing, it waits longer for one, then plays alone", () => {
    expect(voiceStartInMs({ ...waiting, songPlaying: false })).toBe(VOICE_SONG_WAIT_MS);
    expect(VOICE_SONG_WAIT_MS).toBeGreaterThan(VOICE_LEAD_MS);
  });

  it("doesn't count down while paused, closed, in the background, or giving way", () => {
    expect(voiceStartInMs({ ...waiting, filmPlaying: false })).toBeNull();
    expect(voiceStartInMs({ ...waiting, held: true })).toBeNull();
  });

  it("only before it has started, once per opening", () => {
    expect(voiceStartInMs({ ...waiting, phase: "started" })).toBeNull();
    expect(voiceStartInMs({ ...waiting, phase: "done" })).toBeNull();
  });
});

describe("voiceSounds", () => {
  const started = { phase: "started" as const, filmPlaying: true, held: false };

  it("sounds once started while the film plays", () => {
    expect(voiceSounds(started)).toBe(true);
  });

  it("waits where it is while paused, in the background, or giving way to a clip's sound", () => {
    expect(voiceSounds({ ...started, filmPlaying: false })).toBe(false);
    expect(voiceSounds({ ...started, held: true })).toBe(false);
  });

  it("not before the lead-in, and not again after it ended or was dropped", () => {
    expect(voiceSounds({ ...started, phase: "waiting" })).toBe(false);
    expect(voiceSounds({ ...started, phase: "done" })).toBe(false);
  });
});

describe("voice timing", () => {
  it("drops a recording that can't be heard well before a long one would end", () => {
    expect(VOICE_STALL_MS).toBeGreaterThan(VOICE_LEAD_MS);
    expect(VOICE_STALL_MS).toBeLessThan(MAX_VOICE_MS / 10);
  });
});

describe("voiceDuck", () => {
  const heard = { audible: true, ducked: false, songHeld: false, isPreview: false, songPlaying: true };

  it("turns full playback down through iOS once the voice is heard", () => {
    expect(voiceDuck(heard)).toBe("others");
  });

  it("fades a preview down instead", () => {
    expect(voiceDuck({ ...heard, isPreview: true })).toBe("preview");
    expect(voiceDuck({ ...heard, isPreview: true, songPlaying: false })).toBe("preview");
  });

  it("does nothing before the voice is heard, twice, or while the song is paused for it", () => {
    expect(voiceDuck({ ...heard, audible: false })).toBeNull();
    expect(voiceDuck({ ...heard, ducked: true })).toBeNull();
    expect(voiceDuck({ ...heard, songHeld: true })).toBeNull();
  });

  it("leaves a full song that isn't playing yet, and ducks it once it starts", () => {
    expect(voiceDuck({ ...heard, songPlaying: false })).toBeNull();
    expect(voiceDuck({ ...heard, songPlaying: true })).toBe("others");
  });
});

describe("heldSongAction", () => {
  const held = { songHeld: true, voiceWanted: false, visible: true, paused: false, appActive: true };

  it("brings the song back when the voice stops sounding in a playing film", () => {
    expect(heldSongAction(held)).toBe("resume");
  });

  it("keeps it paused while the voice still sounds, or when nothing is held", () => {
    expect(heldSongAction({ ...held, voiceWanted: true })).toBe("keep");
    expect(heldSongAction({ ...held, songHeld: false })).toBe("keep");
  });

  it("waits in the background: the voice carries on when the app is back", () => {
    expect(heldSongAction({ ...held, appActive: false })).toBe("keep");
  });

  it("lets go without starting the song after a close or a pause", () => {
    expect(heldSongAction({ ...held, paused: true })).toBe("release");
    expect(heldSongAction({ ...held, visible: false })).toBe("release");
    expect(heldSongAction({ ...held, visible: false, appActive: false })).toBe("release");
  });
});

describe("clipSoundDuck", () => {
  it("takes over a song paused for the voice: it stays paused under the clip", () => {
    expect(clipSoundDuck({ voiceHeldSong: true, isPreview: false, songPlaying: false })).toBe("takeHeldSong");
  });

  it("otherwise turns the song down like for the voice", () => {
    expect(clipSoundDuck({ voiceHeldSong: false, isPreview: true, songPlaying: true })).toBe("preview");
    expect(clipSoundDuck({ voiceHeldSong: false, isPreview: false, songPlaying: true })).toBe("others");
    expect(clipSoundDuck({ voiceHeldSong: false, isPreview: false, songPlaying: false })).toBeNull();
  });
});
