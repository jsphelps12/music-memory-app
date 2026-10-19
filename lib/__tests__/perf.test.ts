import { describe, it, expect, beforeEach } from "vitest";
import { markStartup, reportStartup, startTimer, __resetPerfForTests } from "../perf";

describe("startup timing", () => {
  beforeEach(() => __resetPerfForTests());

  it("reports each step once, as *_ms, with context", () => {
    markStartup("fonts_loaded");
    markStartup("fonts_loaded");
    const events: [string, Record<string, unknown>][] = [];
    reportStartup((e, p) => events.push([e, p]), { signed_in: true });
    expect(events).toHaveLength(1);
    const [name, props] = events[0];
    expect(name).toBe("app_startup");
    expect(props.signed_in).toBe(true);
    expect(typeof props.fonts_loaded_ms).toBe("number");
    expect(typeof props.first_screen_ms).toBe("number");
  });

  it("only reports once and ignores marks after reporting", () => {
    const events: unknown[] = [];
    reportStartup(() => events.push(1));
    markStartup("late");
    reportStartup(() => events.push(2));
    expect(events).toEqual([1]);
  });

  it("times a flow", () => {
    const stop = startTimer();
    expect(stop()).toBeGreaterThanOrEqual(0);
  });
});
