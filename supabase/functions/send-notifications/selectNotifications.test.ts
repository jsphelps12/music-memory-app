import { describe, expect, it } from "vitest";
import {
  buildSelectionInputs,
  computeStreak,
  frequencyOf,
  localDay,
  monthYear,
  normalizeTimezone,
  selectNotifications,
  spacingAllows,
  type EligibleUser,
  type SelectNotificationsInput,
  type UserMomentRow,
} from "./selectNotifications";

const DAY = 86400000;
const NOW = new Date("2026-07-15T10:00:00.000Z");

function ago(days: number, hours = 0): string {
  return new Date(NOW.getTime() - days * DAY - hours * 3600000).toISOString();
}

function dateAgo(days: number): string {
  return ago(days).slice(0, 10);
}

function user(id: string, over: Partial<EligibleUser> = {}): EligibleUser {
  return { id, push_token: `tok-${id}`, created_at: ago(400), timezone: "UTC", ...over };
}

function moment(userId: string, over: Partial<UserMomentRow> = {}): UserMomentRow {
  return {
    id: `m-${userId}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: userId,
    moment_date: dateAgo(0),
    song_title: "Nightswimming",
    song_artist: "R.E.M.",
    created_at: ago(0),
    ...over,
  };
}

/**
 * Build the input the same way index.ts does, from a flat moment list, so the
 * tests exercise the real map shapes rather than hand-rolled ones.
 */
function buildInput(
  users: EligibleUser[],
  moments: UserMomentRow[],
  over: Partial<SelectNotificationsInput> = {}
): SelectNotificationsInput {
  const now = over.now ?? NOW;
  const todayStr = now.toISOString().slice(0, 10);

  const allMoments = [...moments].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const momentsByUser: SelectNotificationsInput["momentsByUser"] = {};
  const loggedTodaySet = new Set<string>();
  for (const row of allMoments) {
    (momentsByUser[row.user_id] ??= []).push({
      id: row.id,
      moment_date: row.moment_date,
      song_title: row.song_title,
      song_artist: row.song_artist,
      created_at: row.created_at,
    });
    const logged = row.created_at.slice(0, 10);
    if (logged === todayStr) loggedTodaySet.add(row.user_id);
  }

  return {
    eligibleUsers: users,
    momentsByUser,
    loggedTodaySet,
    allMoments,
    now,
    todayStr,
    todayYear: now.getUTCFullYear(),
    todayMM: String(now.getUTCMonth() + 1).padStart(2, "0"),
    todayDD: String(now.getUTCDate()).padStart(2, "0"),
    prefsByUserId: Object.fromEntries(users.map((u) => [u.id, u])),
    tokenByUserId: Object.fromEntries(users.map((u) => [u.id, u.push_token as string])),
    random: () => 0,
    ...over,
  };
}

/** A perfect run of `n` consecutive days ending today. */
function streakMoments(userId: string, n: number): UserMomentRow[] {
  return Array.from({ length: n }, (_, i) =>
    moment(userId, { id: `${userId}-s${i}`, created_at: ago(i, 1) })
  );
}

describe("computeStreak", () => {
  const today = "2026-07-15";
  it("is 0 with no moments", () => expect(computeStreak([], today)).toBe(0));
  it("is 0 when the newest moment is not today", () => {
    expect(computeStreak(["2026-07-14", "2026-07-13"], today)).toBe(0);
  });
  it("counts consecutive days and dedupes same-day moments", () => {
    expect(computeStreak(["2026-07-15", "2026-07-15", "2026-07-14", "2026-07-13"], today)).toBe(3);
  });
  it("stops at the first gap", () => {
    expect(computeStreak(["2026-07-15", "2026-07-14", "2026-07-12"], today)).toBe(2);
  });
});

describe("selectNotifications cascade", () => {
  it("sends nothing when there is nothing to say", () => {
    // A recent moment only: too new to come back, no anniversary, no milestone.
    const { messages, notifiedUserIds } = selectNotifications(
      buildInput([user("u1")], [moment("u1", { created_at: ago(2) })])
    );
    expect(messages).toEqual([]);
    expect(notifiedUserIds).toEqual([]);
  });

  describe("1 — lifecycle", () => {
    it("nudges a day-1 user with no moments", () => {
      const { messages } = selectNotifications(buildInput([user("u1", { created_at: ago(1) })], []));
      expect(messages).toEqual([
        expect.objectContaining({ to: "tok-u1", title: "Start your story 🎵", data: { type: "create" } }),
      ]);
    });

    it("celebrates a week-old user with moments, pluralising correctly", () => {
      const one = selectNotifications(
        buildInput([user("u1", { created_at: ago(7) })], [moment("u1", { created_at: ago(2) })])
      );
      expect(one.messages[0].body).toBe("You've saved 1 moment. Keep it coming.");
      const two = selectNotifications(
        buildInput(
          [user("u1", { created_at: ago(7) })],
          [moment("u1", { created_at: ago(2) }), moment("u1", { created_at: ago(3) })]
        )
      );
      expect(two.messages[0].body).toBe("You've saved 2 moments. Keep it coming.");
    });

    it("no longer sends the absence pushes (day 7 with nothing, day 14 quiet)", () => {
      const empty = selectNotifications(buildInput([user("u1", { created_at: ago(7) })], []));
      expect(empty.messages).toEqual([]);
      const quiet = selectNotifications(
        buildInput(
          [user("u1", { created_at: ago(14) })],
          [moment("u1", { moment_date: dateAgo(12), created_at: ago(12) })]
        )
      );
      expect(quiet.messages).toEqual([]);
    });

    it("isn't spaced, but How often: Off stops it", () => {
      const recent = user("u1", { created_at: ago(1), last_notified_at: ago(0, 2) });
      expect(selectNotifications(buildInput([recent], [])).messages).toHaveLength(1);
      const off = user("u1", { created_at: ago(1), notif_frequency: "off" });
      expect(selectNotifications(buildInput([off], [])).messages).toEqual([]);
    });
  });

  describe("2 — streak milestone", () => {
    it("fires on a milestone day the user logged", () => {
      const { messages } = selectNotifications(buildInput([user("u1")], streakMoments("u1", 5)));
      expect(messages[0].title).toBe("5-Day Streak 🔥");
    });

    it("respects notif_milestones=false, but not a merely-missing pref", () => {
      const off = selectNotifications(
        buildInput([user("u1", { notif_milestones: false })], streakMoments("u1", 10))
      );
      expect(off.messages.every((m) => !m.title.includes("Streak"))).toBe(true);
      const missing = selectNotifications(buildInput([user("u1")], streakMoments("u1", 10)));
      expect(missing.messages[0].title).toBe("10-Day Streak 🔥");
    });

    it("no longer reminds anyone to keep a streak going", () => {
      const { messages } = selectNotifications(
        buildInput([user("u1")], [moment("u1", { created_at: ago(1) })])
      );
      expect(messages).toEqual([]);
    });
  });

  describe("3 — on this day", () => {
    it("says one year in the singular and never includes the user's words", () => {
      const { messages } = selectNotifications(
        buildInput([user("u1")], [moment("u1", { id: "otd", moment_date: "2025-07-15", created_at: ago(365) })])
      );
      expect(messages[0]).toEqual({
        to: "tok-u1",
        title: "1 year ago today",
        body: "Nightswimming, R.E.M.",
        data: { momentId: "otd", type: "memory" },
      });
    });

    it("picks the most recent prior year that matches today's month/day", () => {
      const { messages } = selectNotifications(
        buildInput(
          [user("u1")],
          [
            moment("u1", { id: "old", moment_date: "2021-07-15", created_at: ago(1800) }),
            moment("u1", { id: "new", moment_date: "2024-07-15", created_at: ago(700) }),
          ]
        )
      );
      expect(messages[0].data).toEqual({ momentId: "new", type: "memory" });
      expect(messages[0].title).toBe("2 years ago today");
    });

    it("ignores a moment dated today this year", () => {
      const { messages } = selectNotifications(
        buildInput([user("u1")], [moment("u1", { moment_date: "2026-07-15", created_at: ago(1) })])
      );
      expect(messages).toEqual([]);
    });

    it("respects notif_on_this_day=false and leaves the user free for a random memory", () => {
      const { messages } = selectNotifications(
        buildInput(
          [user("u1", { notif_on_this_day: false })],
          [moment("u1", { moment_date: "2024-07-15", created_at: ago(700) })]
        )
      );
      expect(messages).toHaveLength(1);
      expect(messages[0].title).toBe("Remember this? 🎵");
    });
  });

  describe("4 — a random memory", () => {
    it("picks a month-old moment with the injected random source, opening the memory card", () => {
      const moments = [
        moment("u1", { id: "fresh", created_at: ago(5) }),
        moment("u1", { id: "a", moment_date: "2019-06-03", song_title: "Holocene", song_artist: "Bon Iver", created_at: ago(60) }),
        moment("u1", { id: "b", created_at: ago(90) }),
      ];
      const { messages } = selectNotifications(buildInput([user("u1")], moments, { random: () => 0 }));
      expect(messages[0]).toEqual({
        to: "tok-u1",
        title: "Remember this? 🎵",
        body: "Holocene, Bon Iver · June 2019",
        data: { momentId: "a", type: "memory" },
      });
      const last = selectNotifications(buildInput([user("u1")], moments, { random: () => 0.999 }));
      expect(last.messages[0].data).toEqual({ momentId: "b", type: "memory" });
    });

    it("skips users with only recent moments and users with notif_resurfacing=false", () => {
      const fresh = selectNotifications(buildInput([user("u1")], [moment("u1", { created_at: ago(29) })]));
      expect(fresh.messages).toEqual([]);
      const off = selectNotifications(
        buildInput([user("u1", { notif_resurfacing: false })], [moment("u1", { created_at: ago(60) })])
      );
      expect(off.messages).toEqual([]);
    });
  });

  describe("How often", () => {
    const old = () => [moment("u1", { created_at: ago(60) })];

    it("reads unknown or missing settings as a few times a week", () => {
      expect(frequencyOf(user("u1"))).toBe("few");
      expect(frequencyOf(user("u1", { notif_frequency: "hourly" }))).toBe("few");
      expect(frequencyOf(user("u1", { notif_frequency: "weekly" }))).toBe("weekly");
    });

    it("spaces memories 1, 3 or 7 days apart, with a few hours' slack", () => {
      const at = (f: string, days: number, hours = 0) =>
        spacingAllows(user("u1", { notif_frequency: f, last_notified_at: ago(days, hours) }), NOW);
      expect(at("daily", 1)).toBe(true);
      expect(at("daily", 0, 20)).toBe(false);
      expect(at("few", 2)).toBe(false);
      expect(at("few", 2, 22)).toBe(true);
      expect(at("weekly", 6)).toBe(false);
      expect(at("weekly", 7)).toBe(true);
      expect(at("off", 30)).toBe(false);
      expect(spacingAllows(user("u1", { notif_frequency: "weekly" }), NOW)).toBe(true);
    });

    it("holds memories (On this day included) until the spacing allows", () => {
      const recent = user("u1", { notif_frequency: "weekly", last_notified_at: ago(3) });
      const otd = [moment("u1", { moment_date: "2024-07-15", created_at: ago(700) })];
      expect(selectNotifications(buildInput([recent], otd)).messages).toEqual([]);
      expect(selectNotifications(buildInput([recent], old())).messages).toEqual([]);
      const due = user("u1", { notif_frequency: "weekly", last_notified_at: ago(7) });
      expect(selectNotifications(buildInput([due], otd)).messages[0].title).toBe("2 years ago today");
    });

    it("Off sends nothing at all", () => {
      const off = user("u1", { notif_frequency: "off" });
      const moments = [...streakMoments("u1", 5), moment("u1", { moment_date: "2024-07-15", created_at: ago(700) })];
      expect(selectNotifications(buildInput([off], moments)).messages).toEqual([]);
    });
  });

  describe("one notification per user per run", () => {
    it("a user matching several priorities receives only the highest one", () => {
      // Day-3 lifecycle + on-this-day + an old memory would all match on their own.
      const u = user("u1", { created_at: ago(3) });
      const moments = [moment("u1", { id: "otd", moment_date: "2023-07-15", created_at: ago(500) })];
      const { messages, notifiedUserIds } = selectNotifications(buildInput([u], moments));
      expect(messages).toHaveLength(1);
      expect(messages[0].title).toBe("3 days in 🎶");
      expect(notifiedUserIds).toEqual(["u1"]);
    });

    it("fans out across many users, at most one message each, and reports who was sent to", () => {
      const users = [
        user("newbie", { created_at: ago(1) }),
        user("streaker"),
        user("nostalgic"),
        user("dormant"),
        user("spaced", { notif_frequency: "weekly", last_notified_at: ago(2) }),
      ];
      const moments = [
        ...streakMoments("streaker", 10),
        moment("nostalgic", { id: "n1", moment_date: "2021-07-15", created_at: ago(500) }),
        moment("dormant", { id: "d1", created_at: ago(40) }),
        moment("spaced", { id: "s1", created_at: ago(40) }),
      ];
      const { messages, notifiedUserIds } = selectNotifications(buildInput(users, moments));
      expect(messages.map((m) => m.to)).toEqual(["tok-newbie", "tok-streaker", "tok-nostalgic", "tok-dormant"]);
      expect(messages[3].title).toBe("Remember this? 🎵");
      expect(new Set(notifiedUserIds)).toEqual(new Set(["newbie", "streaker", "nostalgic", "dormant"]));
    });
  });

  it("monthYear names the month, or nothing for a bad date", () => {
    expect(monthYear("2019-06-03")).toBe("June 2019");
    expect(monthYear("garbage")).toBe("");
  });
});

describe("local-day inputs (users' own calendar, not UTC)", () => {
  it("localDay gives the zone's date, yesterday and weekday", () => {
    // 23:00 UTC Wed Jul 15 is 09:00 Thu Jul 16 in Sydney (UTC+10).
    const at = new Date("2026-07-15T23:00:00.000Z");
    expect(localDay(at, "Australia/Sydney")).toEqual({
      dateStr: "2026-07-16",
      yesterdayStr: "2026-07-15",
      year: 2026,
      mm: "07",
      dd: "16",
      dow: 4,
    });
    expect(localDay(at, "UTC").dateStr).toBe("2026-07-15");
    // 04:00 UTC Jan 1 is still Dec 31 in New York; yesterday crosses the year.
    expect(localDay(new Date("2026-01-01T04:00:00Z"), "America/New_York").yesterdayStr).toBe(
      "2025-12-30"
    );
  });

  it("normalizeTimezone falls back to UTC for missing or unknown zones", () => {
    expect(normalizeTimezone(null)).toBe("UTC");
    expect(normalizeTimezone("Not/AZone")).toBe("UTC");
    expect(normalizeTimezone("Europe/Paris")).toBe("Europe/Paris");
  });

  it("a moment logged late evening local counts as yesterday, not today", () => {
    // New York user: 10am EDT Jul 19 = 14:00 UTC. They logged 9pm EDT Jul 18
    // (01:00 UTC Jul 19), which UTC would call "today".
    const now = new Date("2026-07-19T14:00:00.000Z");
    const ny = user("ny", { timezone: "America/New_York" });
    const rows = [moment("ny", { created_at: "2026-07-19T01:00:00.000Z", song_title: "Late" })];
    const [input] = buildSelectionInputs([ny], rows, now, () => 0);
    expect(input.todayStr).toBe("2026-07-19");
    expect(input.loggedTodaySet.has("ny")).toBe(false);
    expect(input.momentsByUser.ny[0].local_created_date).toBe("2026-07-18");
  });

  it("groups users on different local dates and uses each date for On This Day", () => {
    // 20:00 UTC Mon Jul 13: 10am Tue Jul 14 in Kiritimati (UTC+14),
    // 10am Mon Jul 13 in Honolulu (UTC-10).
    const now = new Date("2026-07-13T20:00:00.000Z");
    const east = user("east", { timezone: "Pacific/Kiritimati" });
    const west = user("west", { timezone: "Pacific/Honolulu" });
    const rows = [
      moment("west", { moment_date: "2024-07-14", created_at: "2026-07-10T00:00:00.000Z" }),
      moment("east", { moment_date: "2024-07-14", created_at: "2026-06-01T00:00:00.000Z" }),
    ];
    const inputs = buildSelectionInputs([east, west], rows, now, () => 0);
    expect(inputs).toHaveLength(2);
    const byUser = Object.fromEntries(inputs.map((i) => [i.eligibleUsers[0].id, i]));
    expect(byUser.east.todayStr).toBe("2026-07-14");
    expect(byUser.west.todayStr).toBe("2026-07-13");
    expect(byUser.west.allMoments?.every((m) => m.user_id === "west")).toBe(true);

    // East's Jul 14 anniversary is today for them; for West it's tomorrow.
    expect(selectNotifications(byUser.east).messages[0]?.title).toMatch(/ago today$/);
    expect(selectNotifications(byUser.west).messages[0]?.title ?? "").not.toMatch(/ago today$/);
  });

  it("streak milestones count local logging days", () => {
    // Tokyo (UTC+9), now = 10am Jul 15 local. Five consecutive local days,
    // most of them at 23:30 local, which UTC files under the same date but
    // one of them (01:00 local Jul 15) UTC files under Jul 14.
    const now = new Date("2026-07-15T01:00:00.000Z");
    const tk = user("tk", { timezone: "Asia/Tokyo" });
    const rows = [
      moment("tk", { created_at: "2026-07-14T16:00:00.000Z" }), // Jul 15 01:00 local
      moment("tk", { created_at: "2026-07-14T14:30:00.000Z" }), // Jul 14 23:30
      moment("tk", { created_at: "2026-07-13T14:30:00.000Z" }), // Jul 13 23:30
      moment("tk", { created_at: "2026-07-12T14:30:00.000Z" }), // Jul 12 23:30
      moment("tk", { created_at: "2026-07-11T14:30:00.000Z" }), // Jul 11 23:30
    ];
    const [input] = buildSelectionInputs([tk], rows, now, () => 0);
    expect(input.loggedTodaySet.has("tk")).toBe(true);
    expect(selectNotifications(input).messages[0]?.title).toBe("5-Day Streak 🔥");
  });
});
