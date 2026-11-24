/**
 * Voice entries to text (1.5): tidying a transcript without changing its
 * words, whether it fills the reflection or is offered ("Use what you said",
 * Decision 7), and how transcribeRecording reports the native result. The
 * native transcription itself (modules/on-device-ai) is stood in for.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAsyncStorageMock } from "./helpers/asyncStorageMock";

// lib/captureDraft (for hasWriting) pulls in storage and file glue.
const storage = createAsyncStorageMock();
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage, ...storage }));
vi.mock("../captureDraftFiles", () => ({
  keepDraftPhotos: vi.fn(),
  pruneDraftFiles: vi.fn(),
  deleteDraftFiles: vi.fn(),
}));

const native = vi.hoisted(() => ({ transcribeFile: vi.fn() }));
vi.mock("@/modules/on-device-ai", () => native);

// The real wrappers in modules/on-device-ai run against this stand-in for the
// native module (null: a binary without it).
const nativeModule = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => nativeModule.current }));

const { applyTranscript, cleanTranscript, transcribeRecording } = await import("../transcription");

const STARTERS = ["It takes me back to ", "Just found this ", "Today I "];

describe("cleanTranscript", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanTranscript("  this was   the summer\n we drove  west.  ")).toBe("This was the summer we drove west.");
  });

  it("capitalises the first letter only", () => {
    expect(cleanTranscript("my dad played this. every sunday")).toBe("My dad played this. every sunday.");
  });

  it("capitalises past an opening quote", () => {
    expect(cleanTranscript("“hey jude” was on")).toBe("“Hey jude” was on.");
  });

  it("leaves text that starts with a number alone", () => {
    expect(cleanTranscript("3am in the dorm")).toBe("3am in the dorm.");
  });

  it("adds a full stop when it trails off", () => {
    expect(cleanTranscript("We sang it all the way home")).toBe("We sang it all the way home.");
  });

  it("turns a dangling comma or dash into a full stop", () => {
    expect(cleanTranscript("It was raining,")).toBe("It was raining.");
    expect(cleanTranscript("and then —")).toBe("And then.");
  });

  it("keeps the punctuation it ends with", () => {
    expect(cleanTranscript("Do you remember?")).toBe("Do you remember?");
    expect(cleanTranscript("Best night ever!")).toBe("Best night ever!");
    expect(cleanTranscript("It was late…")).toBe("It was late…");
    expect(cleanTranscript("She said “again.”")).toBe("She said “again.”");
  });

  it("is empty for nothing said", () => {
    expect(cleanTranscript("")).toBe("");
    expect(cleanTranscript("   \n ")).toBe("");
    expect(cleanTranscript(" , ")).toBe("");
  });

  it("is stable when run twice", () => {
    const once = cleanTranscript("  the first dance   at our wedding ");
    expect(cleanTranscript(once)).toBe(once);
  });
});

describe("applyTranscript", () => {
  it("fills an empty reflection", () => {
    expect(applyTranscript("", "the drive to kona")).toEqual({ action: "fill", text: "The drive to kona." });
  });

  it("fills a reflection that's only whitespace", () => {
    expect(applyTranscript("  \n ", "The drive to Kona.")).toEqual({ action: "fill", text: "The drive to Kona." });
  });

  it("replaces a starter the app put there", () => {
    expect(applyTranscript("It takes me back to ", "Our first apartment", STARTERS)).toEqual({
      action: "fill",
      text: "Our first apartment.",
    });
  });

  it("replaces a prompt the app put there", () => {
    const prompt = "What was playing on the drive to Kona?";
    expect(applyTranscript(prompt, "the rental car", [prompt])).toEqual({ action: "fill", text: "The rental car." });
  });

  it("offers it when there's writing", () => {
    expect(applyTranscript("It takes me back to Lisbon", "We danced on the roof", STARTERS)).toEqual({
      action: "offer",
      text: "We danced on the roof.",
    });
  });

  it("treats a starter's text without the trailing space as the starter", () => {
    expect(applyTranscript("Today I", "walked home in the snow", STARTERS)).toEqual({
      action: "fill",
      text: "Walked home in the snow.",
    });
  });

  it("does nothing for an empty transcript", () => {
    expect(applyTranscript("", "   ")).toEqual({ action: "none" });
    expect(applyTranscript("Some writing", "")).toEqual({ action: "none" });
  });

  it("does nothing when the words are already in the reflection", () => {
    expect(applyTranscript("We danced on the roof. Then it rained.", "we danced on the roof")).toEqual({
      action: "none",
    });
  });
});

describe("transcribeRecording", () => {
  beforeEach(() => native.transcribeFile.mockReset());

  it("returns the cleaned text", async () => {
    native.transcribeFile.mockResolvedValue({ ok: true, text: "  the summer  we met ", locale: "en-US" });
    await expect(transcribeRecording("file:///voice.m4a")).resolves.toEqual({ ok: true, text: "The summer we met." });
    expect(native.transcribeFile).toHaveBeenCalledWith("file:///voice.m4a", undefined);
  });

  it("passes a locale through", async () => {
    native.transcribeFile.mockResolvedValue({ ok: true, text: "hola", locale: "es-ES" });
    await transcribeRecording("file:///voice.m4a", "es-ES");
    expect(native.transcribeFile).toHaveBeenCalledWith("file:///voice.m4a", "es-ES");
  });

  it("reports empty text as no speech", async () => {
    native.transcribeFile.mockResolvedValue({ ok: true, text: "  ", locale: "en-US" });
    await expect(transcribeRecording("file:///voice.m4a")).resolves.toEqual({ ok: false, reason: "no_speech" });
  });

  it.each(["unavailable", "denied", "unsupported", "no_speech", "failed"] as const)(
    "passes %s through",
    async (reason) => {
      native.transcribeFile.mockResolvedValue({ ok: false, reason });
      await expect(transcribeRecording("file:///voice.m4a")).resolves.toEqual({ ok: false, reason });
    }
  );
});

describe("modules/on-device-ai speech wrappers", () => {
  type Wrappers = typeof import("../../modules/on-device-ai");
  async function load(mod: Record<string, unknown> | null): Promise<Wrappers> {
    vi.resetModules();
    nativeModule.current = mod;
    return vi.importActual<Wrappers>("@/modules/on-device-ai");
  }

  it("is unavailable without the native module", async () => {
    const m = await load(null);
    expect(m.canTranscribe()).toBe(false);
    expect(m.speechAuthorizationStatus()).toBe("unavailable");
    await expect(m.requestSpeechAuthorization()).resolves.toBe("unavailable");
    await expect(m.transcribeFile("file:///a.m4a")).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("is unavailable on a binary from before 1.5 (module without speech)", async () => {
    const m = await load({ canAsk: () => false, analyzePhotos: async () => [] });
    expect(m.canTranscribe()).toBe(false);
    await expect(m.transcribeFile("file:///a.m4a")).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("returns the transcript", async () => {
    const transcribe = vi.fn(async () => ({
      text: "The summer we met",
      segments: [{ text: "The", startMs: 0, durationMs: 200 }],
      locale: "en-US",
    }));
    const m = await load({ transcribeFile: transcribe });
    await expect(m.transcribeFile("file:///a.m4a")).resolves.toEqual({
      ok: true,
      text: "The summer we met",
      segments: [{ text: "The", startMs: 0, durationMs: 200 }],
      locale: "en-US",
    });
    expect(transcribe).toHaveBeenCalledWith("file:///a.m4a", null);
  });

  it("maps native error codes, anything else is failed", async () => {
    const reject = (code?: string) => async () => {
      throw Object.assign(new Error("x"), code ? { code } : {});
    };
    for (const code of ["denied", "unsupported", "no_speech", "failed"]) {
      const m = await load({ transcribeFile: reject(code) });
      await expect(m.transcribeFile("file:///a.m4a")).resolves.toEqual({ ok: false, reason: code });
    }
    for (const code of ["ERR_SOMETHING", undefined]) {
      const m = await load({ transcribeFile: reject(code) });
      await expect(m.transcribeFile("file:///a.m4a")).resolves.toEqual({ ok: false, reason: "failed" });
    }
  });

  it("reads the permission, treating unknown values as denied", async () => {
    let m = await load({ speechAuthorizationStatus: () => "undetermined", requestSpeechAuthorization: async () => "authorized" });
    expect(m.speechAuthorizationStatus()).toBe("undetermined");
    await expect(m.requestSpeechAuthorization()).resolves.toBe("authorized");
    m = await load({ speechAuthorizationStatus: () => "weird" });
    expect(m.speechAuthorizationStatus()).toBe("denied");
  });
});
