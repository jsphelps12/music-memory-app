import { describe, expect, it } from "vitest";
import { photoExtension, photoFileName, safeFileName } from "../occasionDownloads";

describe("safeFileName", () => {
  it("drops path and reserved characters", () => {
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a b c d e f g h i j");
    expect(safeFileName("../../etc/passwd")).toBe("etc passwd");
    expect(safeFileName("tab\there\nnewline")).toBe("tab here newline");
  });

  it("never comes back empty, and stays short", () => {
    expect(safeFileName("///")).toBe("photo");
    expect(safeFileName("x".repeat(300))).toHaveLength(120);
  });
});

describe("photoExtension", () => {
  it("reads the path, not the query", () => {
    expect(photoExtension("https://x/o/entries/e.PNG?token=a.jpg")).toBe("png");
    expect(photoExtension("https://x/o/entries/e.webp?token=1")).toBe("webp");
    expect(photoExtension("https://x/o/entries/e?token=1")).toBe("jpg");
  });
});

describe("photoFileName", () => {
  it("numbers in order, padded to the total", () => {
    expect(photoFileName(7, 120, "Alex Rivera", "Mr. Brightside", "https://x/e.jpg?t=1")).toBe("007 Alex Rivera - Mr. Brightside.jpg");
    expect(photoFileName(12, 1500, "Mara", "AC/DC: Live", "https://x/e.png")).toBe("0012 Mara - AC DC Live.png");
  });
});
