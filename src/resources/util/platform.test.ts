// @vitest-environment jsdom
//
// Which physical key counts as "command" per platform — the modifier the undo/redo
// chords hang off. Ported alongside the helper itself from the metamodeling twin, so
// the two clients keep agreeing about what Ctrl/⌘ means.
import { describe, it, expect, afterEach } from "vitest";
import { hasCommandModifier, isMacPlatform } from "./platform";

const realUserAgent = navigator.userAgent;

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { value, configurable: true });
}

afterEach(() => setUserAgent(realUserAgent));

describe("platform command modifier", () => {
  it("treats a Macintosh user agent as ⌘", () => {
    setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
    expect(isMacPlatform()).toBe(true);
    expect(hasCommandModifier({ metaKey: true, ctrlKey: false })).toBe(true);
    // Ctrl is not the command key on a Mac, so Ctrl+Z must not trigger app undo
    expect(hasCommandModifier({ metaKey: false, ctrlKey: true })).toBe(false);
  });

  it("treats everything else as Ctrl", () => {
    setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    expect(isMacPlatform()).toBe(false);
    expect(hasCommandModifier({ metaKey: false, ctrlKey: true })).toBe(true);
    // the Windows key is not a shortcut modifier here
    expect(hasCommandModifier({ metaKey: true, ctrlKey: false })).toBe(false);
  });

  it("does not mistake Linux for macOS", () => {
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36");
    expect(isMacPlatform()).toBe(false);
  });
});
