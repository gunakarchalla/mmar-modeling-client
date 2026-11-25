// @vitest-environment jsdom
//
// XrButton overlay (P13). Wiring three's XRButton into the MiddleBody replaced the old
// document.body @ bottom:60px placement. This test pins the port's contract:
//   - it waits for engine.whenReady() before creating the button (the renderer must
//     exist first);
//   - it appends the button engine.createXRButton() returns into its overlay and forces
//     bottom:60px (the old client's one behavioural tweak);
//   - it removes the button on unmount (StrictMode / per-tab remounts must not leak it);
//   - a createXRButton throw is logged, not propagated.
//
// `@/engine` is mocked: importing it for real builds a WebGLRenderer at module scope,
// which jsdom cannot provide (same lesson as ThreeCanvas.test.tsx).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  engine: { whenReady: vi.fn(), createXRButton: vi.fn() },
  logger: { log: vi.fn() },
}));

vi.mock("@/engine", () => ({ engine: mocks.engine }));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));

import XrButton from "./XrButton";

/** Let queued microtasks (the whenReady promise chain) run to completion. */
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.engine.whenReady.mockResolvedValue(undefined);
});

describe("XrButton", () => {
  it("creates the XR button, forces bottom:60px and mounts it into the overlay", async () => {
    const button = document.createElement("button");
    button.id = "XRButton";
    mocks.engine.createXRButton.mockReturnValue(button);

    const { container } = render(<XrButton />);
    await flush();

    expect(mocks.engine.whenReady).toHaveBeenCalledTimes(1);
    expect(mocks.engine.createXRButton).toHaveBeenCalledTimes(1);
    expect(button.style.bottom).toBe("60px");
    expect(container.contains(button)).toBe(true);

    cleanup();
  });

  it("removes the button on unmount", async () => {
    const button = document.createElement("button");
    mocks.engine.createXRButton.mockReturnValue(button);

    const { unmount } = render(<XrButton />);
    await flush();
    expect(button.parentElement).not.toBeNull();

    unmount();
    expect(button.parentElement).toBeNull();
  });

  it("does not append when unmounted before the engine is ready", async () => {
    const button = document.createElement("button");
    mocks.engine.createXRButton.mockReturnValue(button);

    const { unmount } = render(<XrButton />);
    // Unmount BEFORE the whenReady microtask resolves.
    unmount();
    await flush();

    expect(mocks.engine.createXRButton).not.toHaveBeenCalled();
    expect(button.parentElement).toBeNull();
  });

  it("logs, does not throw, when createXRButton fails", async () => {
    mocks.engine.createXRButton.mockImplementation(() => {
      throw new Error("no webxr");
    });

    render(<XrButton />);
    await flush();

    expect(mocks.logger.log).toHaveBeenCalledWith(
      expect.stringContaining("XR button could not be created"),
      "error",
    );

    cleanup();
  });
});
