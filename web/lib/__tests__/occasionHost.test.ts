import { describe, expect, it } from "vitest";
import { guestLink, isSlugShape, safeNext, setupProblem, slugify, timeZoneOptions } from "../occasionHost";

describe("slugify", () => {
  it("makes a readable link from the couple's names", () => {
    expect(slugify("Sam & Priya")).toBe("sam-and-priya");
    expect(slugify("  Zoë + José  ")).toBe("zoe-and-jose");
    expect(slugify("Ana & Bea's Wedding!!")).toBe("ana-and-bea-s-wedding");
  });

  it("caps the length without a trailing dash", () => {
    const slug = slugify("a".repeat(63) + " b");
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("isSlugShape", () => {
  it("accepts lowercase words joined by single dashes", () => {
    expect(isSlugShape("sam-and-priya")).toBe(true);
    expect(isSlugShape("sam--priya")).toBe(false);
    expect(isSlugShape("Sam")).toBe(false);
    expect(isSlugShape("ab")).toBe(false);
  });
});

describe("safeNext", () => {
  it("keeps host paths and drops everything else", () => {
    expect(safeNext("/host/123?x=1")).toBe("/host/123?x=1");
    expect(safeNext("https://evil.example/host")).toBe("/host");
    expect(safeNext("//evil.example/host")).toBe("/host");
    expect(safeNext("/\\evil.example")).toBe("/host");
    expect(safeNext("/for/sam")).toBe("/host");
    expect(safeNext(null)).toBe("/host");
    expect(safeNext("/host/../weddings")).toBe("/host");
  });
});

describe("timeZoneOptions", () => {
  it("puts US zones first and keeps the rest sorted", () => {
    const zones = timeZoneOptions(["Europe/London", "America/New_York", "Asia/Tokyo"]);
    expect(zones[0]).toBe("America/New_York");
    expect(zones.slice(-2)).toEqual(["Asia/Tokyo", "Europe/London"]);
  });
});

describe("setupProblem", () => {
  const ok = {
    names: "Sam & Priya",
    eventDate: "2027-06-14",
    city: "Hudson, NY",
    timeZone: "America/New_York",
    guestEstimate: "120",
    slug: "sam-and-priya",
  };

  it("is null for a good form", () => {
    expect(setupProblem(ok, "2026-10-22")).toBeNull();
    expect(setupProblem({ ...ok, guestEstimate: "" }, "2026-10-22")).toBeNull();
  });

  it("names the first problem", () => {
    expect(setupProblem({ ...ok, names: " " }, "2026-10-22")).toMatch(/names/);
    expect(setupProblem({ ...ok, eventDate: "2026-01-01" }, "2026-10-22")).toMatch(/passed/);
    expect(setupProblem({ ...ok, guestEstimate: "lots" }, "2026-10-22")).toMatch(/number/);
    expect(setupProblem({ ...ok, slug: "Sam Priya" }, "2026-10-22")).toMatch(/link/);
  });
});

describe("guestLink", () => {
  it("is the public /for/ link", () => {
    expect(guestLink("sam-and-priya")).toBe("https://soundtracks.app/for/sam-and-priya");
  });
});
