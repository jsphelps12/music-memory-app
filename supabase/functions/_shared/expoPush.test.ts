import { describe, expect, it } from "vitest";
import { expoPushHeaders } from "./expoPush";

describe("expoPushHeaders", () => {
  it("authenticates sends once the access token is set", () => {
    expect(expoPushHeaders("abc").Authorization).toBe("Bearer abc");
    expect(expoPushHeaders("  abc ").Authorization).toBe("Bearer abc");
  });
  it("sends unauthenticated until then", () => {
    expect(expoPushHeaders(undefined).Authorization).toBeUndefined();
    expect(expoPushHeaders("").Authorization).toBeUndefined();
    expect(expoPushHeaders(null)["Content-Type"]).toBe("application/json");
  });
});
