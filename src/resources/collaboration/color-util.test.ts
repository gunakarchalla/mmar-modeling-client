// P10 unit tests for color_util. Pure functions; the point of the colour hash is that
// it is DETERMINISTIC — every client must paint the same user the same colour without
// coordinating, so these lock the hash's behaviour rather than its exact output.
import { describe, it, expect } from "vitest";
import { userColor, initials } from "./color-util";

describe("userColor", () => {
  it("is stable for the same uuid and produces a valid HSL string", () => {
    const uuid = "ff892138-77e0-47fe-a323-3fe0e1bf0240";
    expect(userColor(uuid)).toBe(userColor(uuid));
    expect(userColor(uuid)).toMatch(/^hsl\(\d{1,3}, 70%, 55%\)$/);
  });

  it("keeps the hue inside 0-359 for arbitrary input", () => {
    for (const uuid of ["", "a", "ζζζ", "x".repeat(500), "ff892138-77e0-47fe-a323-3fe0e1bf0240"]) {
      const hue = Number(/^hsl\((\d+)/.exec(userColor(uuid))![1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("gives different users different colours", () => {
    expect(userColor("user-one")).not.toBe(userColor("user-two"));
  });
});

describe("initials", () => {
  it("takes the first two letters of a single-word name", () => {
    expect(initials("admin")).toBe("AD");
  });

  it("takes first + last initial of a multi-word name", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Johann Sebastian Bach")).toBe("JB");
  });

  it("collapses extra whitespace", () => {
    expect(initials("  Ada   Lovelace  ")).toBe("AL");
  });

  it("falls back to ? for an empty name", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});
