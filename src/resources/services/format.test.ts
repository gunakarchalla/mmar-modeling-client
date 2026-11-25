import { describe, it, expect } from "vitest";
import { numerise, stringifyNumber } from "./format";

describe("numerise", () => {
  it("parses a numeric string", () => {
    expect(numerise("3.5")).toBe(3.5);
    expect(numerise("42")).toBe(42);
  });

  it("falls back for empty / not-defined values", () => {
    expect(numerise("", 1, 0)).toBe(1);
    expect(numerise("not defined", 7, 0)).toBe(7);
    expect(numerise("undefined", undefined, 9)).toBe(9);
  });

  it("prefers the default over the fallback when both are given", () => {
    expect(numerise("", 5, 99)).toBe(5);
  });
});

describe("stringifyNumber", () => {
  it("is the inverse of numerise for numbers", () => {
    expect(stringifyNumber(3.5)).toBe("3.5");
    expect(numerise(stringifyNumber(12))).toBe(12);
  });
});
