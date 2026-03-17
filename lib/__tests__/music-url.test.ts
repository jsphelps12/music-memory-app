import { describe, it, expect, vi } from "vitest";

// Mock native musickit before importing music-url (which imports musickit at top level)
vi.mock("@/lib/musickit", () => ({
  searchSongs: vi.fn(),
}));

import { parseMusicUrl, extractMusicUrl } from "../music-url";

describe("parseMusicUrl", () => {
  describe("Apple Music URLs", () => {
    it("parses album URL with ?i= song param", () => {
      const result = parseMusicUrl(
        "https://music.apple.com/us/album/some-album/123456789?i=987654321"
      );
      expect(result).toEqual({ service: "apple-music", id: "987654321" });
    });

    it("parses direct /song/ URL", () => {
      const result = parseMusicUrl(
        "https://music.apple.com/us/song/some-song/111222333"
      );
      expect(result).toEqual({ service: "apple-music", id: "111222333" });
    });

    it("parses album URL without ?i= (falls back to album ID)", () => {
      const result = parseMusicUrl(
        "https://music.apple.com/us/album/some-album/444555666"
      );
      expect(result).toEqual({ service: "apple-music", id: "444555666" });
    });

    it("parses geo.music.apple.com URLs", () => {
      const result = parseMusicUrl(
        "https://geo.music.apple.com/us/album/some-album/777888999?i=111222333"
      );
      expect(result).toEqual({ service: "apple-music", id: "111222333" });
    });

    it("returns null for Apple Music URL with no recognizable ID", () => {
      const result = parseMusicUrl("https://music.apple.com/us/browse");
      expect(result).toBeNull();
    });
  });

  describe("Spotify URLs", () => {
    it("parses a standard track URL", () => {
      const result = parseMusicUrl(
        "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"
      );
      expect(result).toEqual({
        service: "spotify",
        id: "4uLU6hMCjMI75M1A2tKUQC",
      });
    });

    it("parses a track URL with intl prefix", () => {
      const result = parseMusicUrl(
        "https://open.spotify.com/intl-gb/track/4uLU6hMCjMI75M1A2tKUQC"
      );
      expect(result).toEqual({
        service: "spotify",
        id: "4uLU6hMCjMI75M1A2tKUQC",
      });
    });

    it("returns null for a Spotify playlist URL", () => {
      const result = parseMusicUrl(
        "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
      );
      expect(result).toBeNull();
    });

    it("returns null for a Spotify artist URL", () => {
      const result = parseMusicUrl(
        "https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02"
      );
      expect(result).toBeNull();
    });
  });

  describe("non-music URLs", () => {
    it("returns null for a random website", () => {
      expect(parseMusicUrl("https://example.com/some/page")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(parseMusicUrl("")).toBeNull();
    });

    it("returns null for a malformed URL", () => {
      expect(parseMusicUrl("not a url at all")).toBeNull();
    });
  });
});

describe("extractMusicUrl", () => {
  it("extracts an Apple Music URL from text", () => {
    const text =
      "Check this out! https://music.apple.com/us/album/folklore/1527883677?i=1527883692 so good";
    expect(extractMusicUrl(text)).toBe(
      "https://music.apple.com/us/album/folklore/1527883677?i=1527883692"
    );
  });

  it("extracts a Spotify URL from text", () => {
    const text = "Listening to https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC right now";
    expect(extractMusicUrl(text)).toBe(
      "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"
    );
  });

  it("returns the URL when it is the entire text", () => {
    const url = "https://music.apple.com/us/song/bohemian-rhapsody/1440806523";
    expect(extractMusicUrl(url)).toBe(url);
  });

  it("returns null when no music URL is present", () => {
    expect(extractMusicUrl("just some random text with no links")).toBeNull();
  });

  it("returns null for a non-music URL in text", () => {
    expect(extractMusicUrl("visit https://example.com for details")).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(extractMusicUrl("")).toBeNull();
  });
});
