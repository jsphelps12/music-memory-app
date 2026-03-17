import { describe, it, expect } from "vitest";
import { friendlyError } from "../errors";

describe("friendlyError", () => {
  describe("input coercion", () => {
    it("extracts message from an Error instance", () => {
      expect(friendlyError(new Error("invalid login credentials"))).toBe(
        "Incorrect email or password."
      );
    });

    it("extracts message from a plain object with a message field", () => {
      expect(friendlyError({ message: "network request failed" })).toBe(
        "No connection. Check your internet and try again."
      );
    });

    it("coerces a string directly", () => {
      expect(friendlyError("permission denied")).toBe(
        "You don't have permission to do that."
      );
    });

    it("coerces unknown types via String()", () => {
      expect(friendlyError(42)).toBe("Something went wrong. Please try again.");
    });

    it("handles null", () => {
      expect(friendlyError(null)).toBe("Something went wrong. Please try again.");
    });
  });

  describe("network errors", () => {
    it.each([
      "network request failed",
      "Failed to fetch",
      "NetworkError when attempting to fetch",
      "Load failed",
    ])("matches: %s", (msg) => {
      expect(friendlyError(new Error(msg))).toBe(
        "No connection. Check your internet and try again."
      );
    });
  });

  describe("auth errors", () => {
    it("matches invalid login credentials", () => {
      expect(friendlyError(new Error("Invalid login credentials"))).toBe(
        "Incorrect email or password."
      );
    });

    it("matches email not confirmed", () => {
      expect(friendlyError(new Error("Email not confirmed"))).toBe(
        "Please confirm your email before signing in."
      );
    });

    it("matches user already registered", () => {
      expect(friendlyError(new Error("User already registered"))).toBe(
        "An account with this email already exists."
      );
    });

    it("matches email rate limit exceeded", () => {
      expect(friendlyError(new Error("email rate limit exceeded"))).toBe(
        "Too many attempts. Please wait a few minutes and try again."
      );
    });
  });

  describe("not found errors", () => {
    it("matches PGRST116 code", () => {
      expect(friendlyError(new Error("PGRST116: no rows found"))).toBe(
        "This moment could not be found."
      );
    });

    it("matches 'no rows found' message", () => {
      expect(friendlyError(new Error("no rows found"))).toBe(
        "This moment could not be found."
      );
    });
  });

  describe("permission errors", () => {
    it.each([
      "permission denied for table moments",
      "new row violates row-level security policy",
      "row-level security policy blocked the operation",
    ])("matches: %s", (msg) => {
      expect(friendlyError(new Error(msg))).toBe(
        "You don't have permission to do that."
      );
    });
  });

  describe("storage errors", () => {
    it("matches payload too large", () => {
      expect(friendlyError(new Error("Payload too large"))).toBe(
        "That file is too large. Please try a smaller one."
      );
    });

    it("matches file too large", () => {
      expect(friendlyError(new Error("file too large"))).toBe(
        "That file is too large. Please try a smaller one."
      );
    });
  });

  describe("Apple Sign-In errors", () => {
    it("returns empty string for ERR_REQUEST_CANCELED", () => {
      expect(friendlyError(new Error("ERR_REQUEST_CANCELED"))).toBe("");
    });

    it("returns empty string for 'The operation couldn't be completed'", () => {
      expect(
        friendlyError(new Error("The operation couldn't be completed"))
      ).toBe("");
    });

    it("returns message for ERR_REQUEST_FAILED", () => {
      expect(friendlyError(new Error("ERR_REQUEST_FAILED"))).toBe(
        "Apple Sign-In failed. Please try again."
      );
    });

    it.each(["ERR_REQUEST_NOT_HANDLED", "ERR_REQUEST_UNKNOWN"])(
      "returns 'not available' for %s",
      (code) => {
        expect(friendlyError(new Error(code))).toBe(
          "Apple Sign-In is not available right now."
        );
      }
    );
  });

  describe("fallback", () => {
    it("returns generic message for unrecognized errors", () => {
      expect(friendlyError(new Error("some totally unknown error xyz"))).toBe(
        "Something went wrong. Please try again."
      );
    });
  });
});
