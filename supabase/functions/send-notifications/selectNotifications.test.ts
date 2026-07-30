import { describe, expect, it } from "vitest";
import {
  computeStreak,
  selectNotifications,
  type EligibleUser,
  type SelectNotificationsInput,
  type UserMomentRow,
} from "./selectNotifications";

const DAY = 86400000;
// A Wednesday (dow 3) — neither journal-prompt day (Tue/Thu) nor resurfacing
// day (Mon), so priorities 6 and 7 stay off unless a test opts in.
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
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const allMoments = [...moments].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const momentsByUser: SelectNotificationsInput["momentsByUser"] = {};
  const loggedYesterdayByUser = new Map<string, string>();
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
    if (logged === yesterdayStr && !loggedYesterdayByUser.has(row.user_id)) {
      loggedYesterdayByUser.set(row.user_id, row.song_title);
    }
    if (logged === todayStr) loggedTodaySet.add(row.user_id);
  }

  return {
    eligibleUsers: users,
    momentsByUser,
    loggedYesterdayByUser,
    loggedTodaySet,
    allMoments,
    now,
    todayStr,
    todayYear: now.getUTCFullYear(),
    todayMM: String(now.getUTCMonth() + 1).padStart(2, "0"),
    todayDD: String(now.getUTCDate()).padStart(2, "0"),
    todayDow: now.getUTCDay(),
    daySeed: now.getUTCDate(),
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

describe("selectNotifications priority cascade", () => {
  it("sends nothing when there is nothing to say", () => {
    const u = user("u1", { created_at: ago(400) });
    const { messages, reengagedUserIds } = selectNotifications(
      buildInput([u], [moment("u1", { moment_date: dateAgo(0), created_at: ago(0) })])
    );
    expect(messages).toEqual([]);
    expect(reengagedUserIds).toEqual([]);
  });

  describe("priority 1 — lifecycle", () => {
    it("nudges a day-1 user with no moments", () => {
      const { messages } = selectNotifications(buildInput([user("u1", { created_at: ago(1) })], []));
      expect(messages).toHaveLength(1);
      expect(messages[0].title).toBe("Start your story 🎵");
      expect(messages[0].to).toBe("tok-u1");
    });

    it("celebrates a week-old user with moments, pluralising correctly", () => {
      const one = selectNotifications(
        buildInput([user("u1", { created_at: ago(7) })], [moment("u1", { created_at: ago(3) })])
      );
      expect(one.messages[0].body).toBe("You've saved 1 moment. Keep it coming.");

      const two = selectNotifications(
        buildInput(
          [user("u1", { created_at: ago(7) })],
          [moment("u1", { created_at: ago(3) }), moment("u1", { created_at: ago(4) })]
        )
      );
      expect(two.messages[0].body).toBe("You've saved 2 moments. Keep it coming.");
    });

    it("ignores lifecycle for users with no created_at", () => {
      const { messages } = selectNotifications(buildInput([user("u1", { created_at: null })], []));
      expect(messages).toEqual([]);
    });

    it("has no pref toggle — fires even with every notification pref off", () => {
      const u = user("u1", {
        created_at: ago(1),
        notif_on_this_day: false,
        notif_streak: false,
        notif_prompts: false,
        notif_resurfacing: false,
        notif_milestones: false,
      });
      expect(selectNotifications(buildInput([u], [])).messages).toHaveLength(1);
    });
  });

  describe("priority 2 — streak milestone", () => {
    it.each([5, 10, 25, 50])("fires at a %i-day streak", (n) => {
      const { messages } = selectNotifications(buildInput([user("u1")], streakMoments("u1", n)));
      expect(messages).toHaveLength(1);
      expect(messages[0].title).toBe(`${n}-Day Streak 🔥`);
      expect(messages[0].data).toMatchObject({ type: "tabs", streak: n });
    });

    it.each([4, 6, 11, 26])("stays quiet at a non-milestone %i-day streak", (n) => {
      const { messages } = selectNotifications(buildInput([user("u1")], streakMoments("u1", n)));
      expect(messages.filter((m) => m.title.includes("Streak"))).toHaveLength(0);
    });

    it("respects notif_milestones=false, but not a merely-missing pref", () => {
      const off = selectNotifications(
        buildInput([user("u1", { notif_milestones: false })], streakMoments("u1", 5))
      );
      expect(off.messages.filter((m) => m.title.includes("Streak"))).toHaveLength(0);

      const unset = selectNotifications(
        buildInput([user("u1", { notif_milestones: null })], streakMoments("u1", 5))
      );
      expect(unset.messages).toHaveLength(1);
    });
  });

  describe("priority 3 — on this day", () => {
    it("picks the most recent prior year that matches today's month/day", () => {
      const moments = [
        moment("u1", { id: "old", moment_date: "2022-07-15", song_title: "Old", created_at: ago(900) }),
        moment("u1", { id: "new", moment_date: "2024-07-15", song_title: "New", created_at: ago(400) }),
      ];
      const { messages } = selectNotifications(buildInput([user("u1")], moments));
      expect(messages).toHaveLength(1);
      expect(messages[0].title).toBe("On This Day 🎵");
      expect(messages[0].data).toEqual({ momentId: "new" });
      expect(messages[0].body).toContain("2 years ago");
    });

    it("ignores a moment dated today this year", () => {
      // notif_prompts off so the 400-day dormancy doesn't trip priority 5 instead
      const u = user("u1", { notif_prompts: false });
      const { messages } = selectNotifications(
        buildInput([u], [moment("u1", { moment_date: "2026-07-15", created_at: ago(400) })])
      );
      expect(messages).toEqual([]);
    });

    it("respects notif_on_this_day=false and leaves the user free for a later priority", () => {
      const u = user("u1", { notif_on_this_day: false, notif_prompts: false });
      const { messages } = selectNotifications(
        buildInput([u], [moment("u1", { moment_date: "2024-07-15", created_at: ago(400) })])
      );
      expect(messages).toEqual([]);
    });
  });

  describe("priority 4 — streak reminder", () => {
    it("fires when the user logged yesterday but not today", () => {
      const { messages } = selectNotifications(
        buildInput([user("u1")], [moment("u1", { song_title: "Debaser", created_at: ago(1) })])
      );
      expect(messages).toHaveLength(1);
      expect(messages[0].title).toBe("Keep your streak going 🔥");
      expect(messages[0].data).toEqual({ type: "create" });
    });

    it("stays quiet once the user has logged today", () => {
      const { messages } = selectNotifications(
        buildInput([user("u1")], [moment("u1", { created_at: ago(1) }), moment("u1", { created_at: ago(0) })])
      );
      expect(messages).toEqual([]);
    });

    it("respects notif_streak=false", () => {
      const u = user("u1", { notif_streak: false, notif_prompts: false });
      const { messages } = selectNotifications(buildInput([u], [moment("u1", { created_at: ago(1) })]));
      expect(messages).toEqual([]);
    });
  });

  describe("priority 5 — re-engagement", () => {
    it("stays quiet below the 7-day dormancy floor", () => {
      const { messages } = selectNotifications(
        buildInput([user("u1")], [moment("u1", { created_at: ago(6) })])
      );
      expect(messages).toEqual([]);
    });

    it.each([
      [7, "It's been a week. What's been in your ears?"],
      [14, "Nightswimming was your last moment. What's playing now?"],
      [30, "Still there? Even one song keeps the story alive."],
    ])("uses the %i-day copy tier", (days, body) => {
      const { messages, reengagedUserIds } = selectNotifications(
        // daySeed 14 -> index 0 of the two-variant weekly copy list
        buildInput([user("u1")], [moment("u1", { created_at: ago(days) })], { daySeed: 14 })
      );
      expect(messages).toHaveLength(1);
      expect(messages[0].title).toBe("Your music story is waiting 🎶");
      expect(messages[0].body).toBe(body);
      expect(reengagedUserIds).toEqual(["u1"]);
    });

    it.each([
      // [days dormant, days since last nudge, expected to fire]
      [7, 6, false],
      [7, 7, true],
      [14, 13, false],
      [14, 14, true],
      [30, 29, false],
      [30, 30, true],
      [45, 29, false],
    ])("dormant %i days, nudged %i days ago -> fires: %s", (dormant, sinceNudge, shouldFire) => {
      const u = user("u1", { last_reengagement_at: ago(sinceNudge) });
      const { messages, reengagedUserIds } = selectNotifications(
        buildInput([u], [moment("u1", { created_at: ago(dormant) })])
      );
      expect(messages).toHaveLength(shouldFire ? 1 : 0);
      expect(reengagedUserIds).toEqual(shouldFire ? ["u1"] : []);
    });

    it("skips users with no moments at all", () => {
      const { messages } = selectNotifications(buildInput([user("u1")], []));
      expect(messages).toEqual([]);
    });

    it("respects notif_prompts=false", () => {
      const u = user("u1", { notif_prompts: false });
      const { messages } = selectNotifications(buildInput([u], [moment("u1", { created_at: ago(40) })]));
      expect(messages).toEqual([]);
    });
  });

  describe("priority 6 — journal prompt", () => {
    // 2026-07-14 is a Tuesday, 2026-07-16 a Thursday, 2026-07-15 a Wednesday.
    it.each([
      ["2026-07-14T10:00:00.000Z", true],
      ["2026-07-16T10:00:00.000Z", true],
      ["2026-07-15T10:00:00.000Z", false],
    ])("on %s fires: %s", (iso, shouldFire) => {
      const now = new Date(iso);
      const { messages } = selectNotifications(buildInput([user("u1")], [], { now }));
      expect(messages).toHaveLength(shouldFire ? 1 : 0);
      if (shouldFire) expect(messages[0].data).toEqual({ type: "create" });
    });

    it("respects notif_prompts=false", () => {
      const now = new Date("2026-07-14T10:00:00.000Z");
      const u = user("u1", { notif_prompts: false });
      expect(selectNotifications(buildInput([u], [], { now })).messages).toEqual([]);
    });
  });

  describe("priority 7 — random resurfacing", () => {
    // 2026-07-13 is a Monday.
    const MONDAY = new Date("2026-07-13T10:00:00.000Z");
    // These users are long dormant, so notif_prompts is off to keep priority 5
    // from claiming them before the cascade reaches priority 7.
    const noPrompts = { notif_prompts: false } as const;

    it("picks a moment using the injected random source", () => {
      const moments = [
        moment("u1", { id: "a", song_title: "A", created_at: ago(100) }),
        moment("u1", { id: "b", song_title: "B", created_at: ago(200) }),
        moment("u1", { id: "c", song_title: "C", created_at: ago(300) }),
      ];
      const { messages } = selectNotifications(
        buildInput([user("u1", noPrompts)], moments, { now: MONDAY, random: () => 0.9 })
      );
      expect(messages).toHaveLength(1);
      expect(messages[0].title).toBe("Remember this? 🎵");
      expect(messages[0].data).toEqual({ momentId: "c" });
    });

    it("does not fire on a non-Monday", () => {
      const { messages } = selectNotifications(
        buildInput([user("u1", noPrompts)], [moment("u1", { created_at: ago(100) })], { random: () => 0 })
      );
      expect(messages.filter((m) => m.title === "Remember this? 🎵")).toHaveLength(0);
    });

    it("skips users with no moments and users with notif_resurfacing=false", () => {
      const users = [user("u1", noPrompts), user("u2", { ...noPrompts, notif_resurfacing: false })];
      const { messages } = selectNotifications(
        buildInput(users, [moment("u2", { created_at: ago(100) })], { now: MONDAY, random: () => 0 })
      );
      expect(messages).toEqual([]);
    });
  });

  describe("one notification per user per run", () => {
    it("a user matching several priorities receives only the highest one", () => {
      // Day-3 lifecycle + on-this-day + dormancy would all match on their own.
      const u = user("u1", { created_at: ago(3) });
      const moments = [
        moment("u1", { id: "otd", moment_date: "2023-07-15", created_at: ago(500) }),
      ];
      const { messages } = selectNotifications(buildInput([u], moments));
      expect(messages).toHaveLength(1);
      expect(messages[0].title).toBe("3 days in 🎶");
    });

    it("fans out across many users, at most one message each", () => {
      const users = [
        user("newbie", { created_at: ago(1) }),
        user("streaker"),
        user("nostalgic"),
        user("dormant"),
        user("quiet", { notif_prompts: false }),
      ];
      const moments = [
        ...streakMoments("streaker", 10),
        moment("nostalgic", { id: "n1", moment_date: "2021-07-15", created_at: ago(500) }),
        moment("dormant", { id: "d1", created_at: ago(40) }),
        moment("quiet", { id: "q1", created_at: ago(40) }),
      ];
      const { messages, reengagedUserIds } = selectNotifications(buildInput(users, moments));

      expect(messages.map((m) => m.to)).toEqual([
        "tok-newbie",
        "tok-streaker",
        "tok-nostalgic",
        "tok-dormant",
      ]);
      expect(new Set(messages.map((m) => m.to)).size).toBe(messages.length);
      expect(reengagedUserIds).toEqual(["dormant"]);
    });
  });

  it("rotates copy variants deterministically off daySeed", () => {
    const bodies = [3, 4, 5].map((seed) => {
      const now = new Date("2026-07-15T10:00:00.000Z");
      const { messages } = selectNotifications(
        buildInput([user("u1")], [moment("u1", { moment_date: "2025-07-15", created_at: ago(360) })], {
          now,
          daySeed: seed,
        })
      );
      return messages[0].body;
    });
    expect(new Set(bodies).size).toBe(3);
  });
});
